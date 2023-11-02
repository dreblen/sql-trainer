import { defineStore } from 'pinia'

import { DBWrapper } from '@/db-wrapper'
import SqlJsWorker from '@/sqljs-worker?worker'

import initSqlJs from 'sql.js'
import type * as SqlJsTypes from 'sql.js'

// Represents the schema of our IndexedDB object store
interface TrainerDatabase {
    id?: number
    name: string
    originalDefinition: string
    currentDefinition: string
    queries: string
}

// Represents a foreign key relationship for a column
interface DatabaseTableColumnForeignKey {
    localName: string
    foreignName: string
}

// Represents a column definition in a table
interface DatabaseTableColumn {
    id: number
    name: string
    type: string
    allowNull: boolean
    default: string
    isPK: boolean
    fk: string|null
}

// Represents a table definition in a database
interface DatabaseTable {
    name: string
    columns: Array<DatabaseTableColumn>
}

// Represents a single database query (within a database context) along with its
// potential result artifacts, good or bad
class DatabaseContextQuery {
    constructor() {
        this.text = ''
        this.results = []
        this.error = ''
    }

    text: string
    results: Array<SqlJsTypes.QueryExecResult>
    error: string
}

// Represents the selection of a trainer database and everything that goes along
// with it (browser DB, SQLite DB, queries, results, etc.)
class DatabaseContext {
    constructor(id: number, name: string, BrowserDatabase: TrainerDatabase, SqlJsDatabase: SqlJsTypes.Database, queries: Array<DatabaseContextQuery>) {
        this.id = id
        this.name = name
        this.BrowserDatabase = BrowserDatabase
        this.SqlJsDatabase = SqlJsDatabase

        this.tables = this.getTables()

        if (queries.length === 0) {
            this.Queries = [
                new DatabaseContextQuery
            ]
        } else {
            this.Queries = queries
        }
        this.activeQueryIndex = 0

        this.saveTimeoutID = null
    }

    id: number
    name: string
    BrowserDatabase: TrainerDatabase
    SqlJsDatabase: SqlJsTypes.Database

    tables: Array<DatabaseTable>

    Queries: Array<DatabaseContextQuery>
    activeQueryIndex: number

    saveTimeoutID: number|null

    /**
     * Retrieve list of table names in this context.
     * 
     * @returns Array of table name strings.
     */
    public getTableNames (): Array<string> {
        const results = this.SqlJsDatabase.exec(`
            SELECT name
            FROM sqlite_master
            WHERE type IN ('table','view')
        `)
        if (results.length > 0) {
            return results[0].values.map((row) => row[0] as string).sort()
        } else {
            return []
        }
    }

    /**
     * Retrieve column descriptions for specified table.
     * 
     * @param name The name of the table.
     * @returns Array of column definitions.
     */
    public getTableColumns (name: string): Array<DatabaseTableColumn> {
        // Make sure we'll get results for this table
        if (this.getTableNames().indexOf(name) === -1) {
            throw `'${name} is not a valid table name`
        }

        // Get foreign key information
        const fkResults = this.SqlJsDatabase.exec(`PRAGMA foreign_key_list(${name})`)
        let fk: Array<DatabaseTableColumnForeignKey> = []
        if (fkResults && fkResults.length > 0) {
            fk = fkResults[0].values.map((row) => ({
                localName: row[3] as string,
                foreignName: `${row[2]}.${row[4]}`
            }))
        }

        // Get column information
        const results = this.SqlJsDatabase.exec(`PRAGMA table_info(${name})`)
        return results[0].values.map((row) => ({
            id: row[0],
            name: row[1],
            type: row[2],
            allowNull: (row[3] == '0') ? true : false,
            default: row[4],
            isPK: (row[5] == '1') ? true : false,
            fk: fk.find((k) => k.localName === row[1])?.foreignName || null
        } as DatabaseTableColumn))
    }

    /**
     * Retrieve the table/column values in the current context.
     * 
     * @returns Array of table objects, with column details.
     */
    public getTables (): Array<DatabaseTable> {
        const tables: Array<DatabaseTable> = []
        for (const tableName of this.getTableNames()) {
            tables.push({
                name: tableName,
                columns: this.getTableColumns(tableName)
            })
        }
        return tables
    }

    /**
     * Convenience method to create new, empty query.
     * 
     * @returns Nothing
     */
    public addQuery (): void {
        this.Queries.push(new DatabaseContextQuery)
    }

    /**
     * Convenience method to remove the query at the specified index.
     * 
     * @param index The index within the queries list to remove.
     * @returns Nothing
     */
    public removeQuery (index: number): void {
        // If the index is invalid, do nothing
        if (index < 0 || index >= this.Queries.length) {
            return
        }

        // If this is the last query, reset it rather than deleting it
        if (this.Queries.length === 1) {
            this.Queries[index] = new DatabaseContextQuery
            return
        }

        // Make sure our active query will still be valid after removing
        if (this.activeQueryIndex >= index) {
            this.activeQueryIndex--
        }

        // Remove the query
        this.Queries.splice(index, 1)
    }
}

export const useDatabasesStore = defineStore('databases', {
    state: () => ({
        isInitializing: false,
        creationProgressScripts: 0.0,
        creationProgressStatements: 0.0,
        creationProgressIndeterminate: false,

        BrowserDB: null as DBWrapper|null,
        SqlJs: null as SqlJsTypes.SqlJsStatic|null,
        contexts: [] as Array<DatabaseContext>,
        activeContextId: -1,
        hasPendingChanges: false,
        isSavingContext: false
    }),
    getters: {
        activeContext(state): DatabaseContext|null {
            if (state.activeContextId === -1) {
                return null
            } else {
                return state.contexts.find((context) => context.id === state.activeContextId) || null
            }
        },
        activeQuery(): DatabaseContextQuery|null {
            if (this.activeContext === null || this.activeContext.activeQueryIndex < 0 || this.activeContext.activeQueryIndex >= this.activeContext.Queries.length) {
                return null
            } else {
                return this.activeContext.Queries[this.activeContext.activeQueryIndex]
            }
        }
    },
    actions: {
        async init() {
            this.isInitializing = true

            // Configure our IndexedDB wrapper if needed
            if (this.BrowserDB === null) {
                this.BrowserDB = new DBWrapper()
            }

            // Configure SQL.js if needed
            if (this.SqlJs === null) {
                this.SqlJs = await initSqlJs({
                    locateFile: filename => `/${filename}`
                })
            }

            // Check if we have any databases to populate from our browser
            // storage if SQL.js is properly configured
            if (this.SqlJs !== null && this.contexts.length === 0) {
                const databases: Array<TrainerDatabase> = await this.BrowserDB.getAllWithKeys()
                if (databases.length > 0) {
                    // Create and store a working database copy from each of the
                    // persisted database copies
                    for (const database of databases) {
                        await this.add(database)

                        // Set our default context to the last database
                        this.activeContextId = database.id as number
                    }
                }
            }

            this.isInitializing = false
        },
        async clear() {
            // Nothing to do if we haven't initialized yet
            if (this.BrowserDB === null) {
                return
            }

            // Clear data from our IndexedDB database
            await this.BrowserDB.deleteDatabase()
            this.BrowserDB = null

            // Clear our context records
            this.contexts = []
            this.activeContextId = -1

            // Re-initialize
            return this.init()
        },
        add(database: TrainerDatabase): Promise<DatabaseContext> {
            return new Promise((resolve, reject) => {
                const w = new SqlJsWorker()
                const dispose = () => {
                    w.terminate()
                }
                w.onmessage = (m) => {
                    // Make sure it's safe to proceed
                    if (this.SqlJs === null) {
                        reject('Must call init() before adding a database')
                        return
                    }

                    // Create a database context for this database
                    const sqlDB = new this.SqlJs.Database(m.data)
                    const context = new DatabaseContext(
                        database.id as number,
                        database.name,
                        database,
                        sqlDB,
                        JSON.parse(database.queries)
                    )

                    // Add and return the context
                    this.contexts.push(context)
                    resolve(context)
                    
                    setTimeout(dispose, 5000)
                }
                w.onerror = (err) => {
                    reject(err)
                    setTimeout(dispose, 5000)
                }
                w.postMessage({
                    type: 'parse',
                    data: database.currentDefinition
                })
            })
        },
        async delete(id: number) {
            // Make sure it's safe to proceed
            if (this.BrowserDB === null || this.SqlJs === null) {
                throw 'Must call init() before deleting a database'
            }

            // Find the correct database context
            const context = this.contexts.find((context) => context.id === id)
            if (!context) {
                throw `Could not find database context with ID ${id}`
            }

            // Delete the browser database
            await this.BrowserDB.delete(id)

            // Close the SQL.js database
            context.SqlJsDatabase.close()

            // Remove the context
            this.contexts = this.contexts.filter((context) => {
                return context.id !== id
            })

            // Change the active context if we just removed it
            if (this.activeContextId === id) {
                this.activeContextId = (this.contexts.length > 0) ? this.contexts[0].id : -1
            }
        },
        async create(name: string, originalDefinitionScripts: Array<string> = []): Promise<DatabaseContext> {
            // Make sure it's safe to proceed
            if (this.BrowserDB === null || this.SqlJs === null) {
                throw 'Must call init() before creating a database'
            }

            // Create an empty database
            const newDB = new this.SqlJs.Database()

            // Apply the original definition commands if they were given,
            // iterating statements manually instead of using newDB.run() so we
            // don't run out of memory as easily
            for (let i = 0; i < originalDefinitionScripts.length; i++) {
                const originalDefinition = originalDefinitionScripts[i]
                let bytesProcessed = 0
                let totalBytes = -1

                await new Promise((resolve, reject) => {
                    const statements = newDB.iterateStatements(originalDefinition)
                    totalBytes = statements.getRemainingSQL().length
                    const statementReader = (statements: any, next: any) => {
                        try {
                            const it = statements.next()
                            if (it.done) {
                                resolve(null)
                                return
                            }
    
                            const statement = it.value
                            bytesProcessed += statement.getSQL().length
                            this.creationProgressStatements = 100.0 * bytesProcessed / totalBytes
                            statement.run()
    
                            setTimeout(() => {
                                next(statements, next)
                            })
                        } catch (e) {
                            reject(e)
                        }
                    }

                    statementReader(statements, statementReader)
                })

                this.creationProgressScripts = 100.0 * (i + 1) / originalDefinitionScripts.length
            }

            // Create a browser database equivalent
            this.creationProgressIndeterminate = true
            const def = await this.exportSqlJsToJSON(newDB)
            this.creationProgressIndeterminate = false
            const browserDB: TrainerDatabase = {
                name,
                originalDefinition: def,
                currentDefinition: def,
                queries: JSON.stringify([])
            }
            browserDB.id = (await this.BrowserDB.add(browserDB)) as number

            // Create a database context for the new database
            const context = new DatabaseContext(
                browserDB.id,
                name,
                browserDB,
                newDB,
                JSON.parse(browserDB.queries)
            )

            // Add and return the context, setting it as the active context if
            // it's the only one
            this.contexts.push(context)
            if (this.contexts.length === 1) {
                this.activeContextId = browserDB.id
            }

            // Reset our progress indicators
            this.creationProgressScripts = 0
            this.creationProgressStatements = 0

            return context
        },
        async run() {
            // Store the active query for the active context
            if (this.activeContext === null || this.activeQuery === null) {
                return
            }
            const activeQuery = this.activeQuery

            // Remove any existing results/errors for the query
            activeQuery.results = []
            activeQuery.error = ''

            // Split our query text into individual statements and iterate them
            // so we have more control over the formatting of the results (i.e.,
            // we're basically doing the same as SqlJsDatabase.exec() but we
            // want to do things like include empty result sets)
            const statements = this.activeContext.SqlJsDatabase.iterateStatements(activeQuery.text)
            const results: Array<SqlJsTypes.QueryExecResult> = []
            try {
                // The statement iterator will throw an exception if it
                // encounters an invalid statement, so the whole loop is in the
                // try-catch block instead of the individual steps. We can still
                // use the results we gather up to the point of the error.
                for (const statement of statements) {
                    // Store the column names (for SELECT-type queries)
                    const columns = statement.getColumnNames()

                    // Gather our row data if applicable (for SELECT-type)
                    const rows = []
                    while (statement.step()) {
                        rows.push(statement.get())
                    }

                    // Get the number of rows affected (for INSERT/UPDATE/DELETE
                    // statements only, not SELECTs or DDL statements)
                    let numRows = 0
                    const statementSQL = statement.getSQL().trimStart()
                    if (statementSQL.startsWith('INSERT') || statementSQL.startsWith('UPDATE') || statementSQL.startsWith('DELETE')) {
                        numRows = this.activeContext.SqlJsDatabase.getRowsModified()
                    }

                    // Store the results of this statement. If there were no
                    // column headings, we assume it was something where we care
                    // about the number of rows affected and not the rows.
                    results.push({
                        columns,
                        values: (columns.length > 0) ?
                            rows :
                            [[numRows as SqlJsTypes.SqlValue]]
                    })

                    // Clean up the statement
                    statement.free()
                }
            } catch (err) {
                activeQuery.error = (err as Error).message
            } finally {
                activeQuery.results = results
            }

            // Save changes to the browser if appropriate (logic is delegated)
            this.saveChangesToBrowser(this.activeContext.id)
        },
        exportSqlJsToJSON(database: SqlJsTypes.Database): Promise<string> {
            return new Promise((resolve, reject) => {
                const w = new SqlJsWorker()
                const dispose = () => {
                    w.terminate()
                }
                w.onmessage = (m) => {
                    resolve(m.data)
                    setTimeout(dispose, 5000)
                }
                w.onerror = (err) => {
                    reject(err)
                    setTimeout(dispose, 5000)
                }
                w.postMessage({
                    type: 'stringify',
                    data: database.export()
                })
            })
        },
        async restoreOriginalToBrowser(id: number) {
            // Make sure it's safe to proceed
            if (this.SqlJs === null) {
                throw 'Must call init() before restoring a database'
            }

            // Find the correct database context
            const context = this.contexts.find((context) => context.id === id)
            if (!context) {
                throw `Could not find database context with ID ${id}`
            }

            // Close the current version of the SQL.js database
            context.SqlJsDatabase.close()

            // Replace the SQL.js database with its original
            context.SqlJsDatabase = new this.SqlJs.Database(JSON.parse(context.BrowserDatabase.originalDefinition))

            // Store our "updated" definition as the new current
            this.saveChangesToBrowser(id, 'definition')
        },
        async saveChangesToBrowser(id: number, type?: 'definition'|'query') {
            // If we're in the middle of *actually* saving pending changes,
            // ignore this call
            if (this.isSavingContext === true) {
                return
            }
            
            // Find the correct database context
            const context = this.contexts.find((context) => context.id === id)
            if (!context) {
                throw `Could not find database context with ID ${id}`
            }

            this.hasPendingChanges = true

            // Cancel any pending save
            if (context.saveTimeoutID !== null) {
                window.clearTimeout(context.saveTimeoutID)
                context.saveTimeoutID = null
            }

            // Schedule a potential save action
            context.saveTimeoutID = window.setTimeout(async () => {
                // Make sure it's safe to proceed
                if (this.BrowserDB === null) {
                    throw 'Must call init() before saving changes to browser'
                }

                this.isSavingContext = true

                // Store our intended changes so we don't try to make two
                // separate update calls
                const changes = {} as {
                    currentDefinition?: string
                    queries?: string
                }

                // Changes in data or structure
                if (type === undefined || type === 'definition') {
                    // Get the current definition and the old definition
                    const newDef = await this.exportSqlJsToJSON(context.SqlJsDatabase)
                    const oldDef = context.BrowserDatabase.currentDefinition

                    // If there have been changes, update the stored definition
                    // and our current table list
                    if (newDef !== oldDef) {
                        context.BrowserDatabase.currentDefinition = newDef
                        context.tables = context.getTables()
                        changes.currentDefinition = newDef
                    }
                }

                // Changes to queries
                if (type === undefined || type === 'query') {
                    // Get the current query list and the old query list
                    const newQueries = JSON.stringify(context.Queries)
                    const oldQueries = context.BrowserDatabase.queries

                    // If there have been changes, update the stored definition
                    if (newQueries !== oldQueries) {
                        context.BrowserDatabase.queries = newQueries
                        changes.queries = newQueries
                    }
                }

                // Persist our changes in the browser database
                if (changes.currentDefinition || changes.queries) {
                    await this.BrowserDB.update(context.id, changes)
                }

                this.hasPendingChanges = false

                // Clear the timeout value
                context.saveTimeoutID = null
                this.isSavingContext = false
            }, 1000)
        }
    }
})
