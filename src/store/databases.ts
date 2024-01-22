import { defineStore } from 'pinia'

import * as HashWrapper from '@/hash-wrapper'
import { DBWrapper } from '@/db-wrapper'

import { SqlJsDBWrapper, ISqlJsDBWrapper } from '@/sqljs-db-wrapper'
import * as SqlJsTypes from 'sql.js'

// Represent the schemas of our IndexedDB object stores
// (all ID values are the same so we don't have to make separate indexes)
interface BrowserMetaSchema {
    id?: number
    name: string
    definitionHash: string
    queryResultsHash: string
}
interface BrowserDefinitionsSchema {
    id?: number
    definition: string
}
interface BrowserQueriesSchema {
    id?: number
    texts: string
}
interface BrowserQueryResultsSchema {
    id?: number
    results: string
    resultHeights: string
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

// Classification of a "table" as a real table or a view
type TableType = 'table'|'view'

// Simple listing of a table's essential details
interface TableDetails {
    name: string
    type: TableType
    definition: string
}

// Represents a table definition in a database
interface DatabaseTable extends TableDetails {
    columns: Array<DatabaseTableColumn>
}

// Represents a single database query (within a database context) along with its
// potential result artifacts, good or bad
class DatabaseContextQuery {
    constructor() {
        this.text = ''
        this.results = []
        this.resultHeights = []
        this.error = ''
        this.isRunning = false
        this.isStopping = false
        this.progress = 0
    }

    text: string
    results: Array<SqlJsTypes.QueryExecResult>
    resultHeights: Array<number>
    error: string
    isRunning: boolean
    isStopping: boolean
    progress: number
}

// Represents the selection of a trainer database and everything that goes along
// with it (browser DB, SQLite DB, queries, results, etc.)
class DatabaseContext {
    constructor(id: number, name: string, BrowserDatabase: BrowserMetaSchema, BrowserQueries: Array<string>, SqlJsDatabase: ISqlJsDBWrapper, queries: Array<DatabaseContextQuery>) {
        this.id = id
        this.name = name
        this.BrowserDatabase = BrowserDatabase
        this.BrowserQueries = BrowserQueries
        this.SqlJsDatabase = SqlJsDatabase

        // Loading tables is an async operation, which we can't do in the
        // constructor; need to call loadTables() after the fact.
        this.tables = []

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
    BrowserDatabase: BrowserMetaSchema
    BrowserQueries: Array<string>
    SqlJsDatabase: ISqlJsDBWrapper

    tables: Array<DatabaseTable>

    Queries: Array<DatabaseContextQuery>
    activeQueryIndex: number

    saveTimeoutID: number|null
    savePromiseResolve?: (value: boolean) => void

    /**
     * Retrieve list of table details from SQL.js.
     * 
     * @returns Array of table details.
     */
    public async getTableDetails (): Promise<Array<TableDetails>> {
        try {
            const results = await this.SqlJsDatabase.exec(`
                SELECT name, type, sql
                FROM sqlite_master
                WHERE type IN ('table','view')
            `)
            if (results.length > 0) {
                return results[0].values.map((row) => ({
                    name: row[0] as string,
                    type: row[1] as TableType,
                    definition: row[2] as string
                }))
            } else {
                return []
            }
        } catch (rejection) {
            console.log('Error loading table details: ', (rejection as { err: string }).err)
            return []
        }
    }

    /**
     * Retrieve list of table names in this context.
     * 
     * @returns Array of table name strings.
     */
    public async getTableNames (): Promise<Array<string>> {
        return (await this.getTableDetails()).map((table) => table.name)
    }

    /**
     * Retrieve column descriptions for specified table.
     * 
     * @param name The name of the table.
     * @returns Array of column definitions.
     */
    public async getTableColumns (name: string): Promise<Array<DatabaseTableColumn>> {
        // Make sure we'll get results for this table
        if ((await this.getTableNames()).indexOf(name) === -1) {
            throw `'${name} is not a valid table name`
        }

        // Get foreign key information
        let fk: Array<DatabaseTableColumnForeignKey> = []
        const fkResults = await this.SqlJsDatabase.exec(`PRAGMA foreign_key_list(${name})`)
            .catch(() => [])
        if (fkResults && fkResults.length > 0) {
            fk = fkResults[0].values.map((row) => ({
                localName: row[3] as string,
                foreignName: `${row[2]}.${row[4]}`
            }))
        }

        // Get column information
        try {
            const results = await this.SqlJsDatabase.exec(`PRAGMA table_info(${name})`)
            return results[0].values.map((row) => ({
                id: row[0],
                name: row[1],
                type: row[2],
                allowNull: (row[3] == '0') ? true : false,
                default: row[4],
                isPK: (row[5] != '0') ? true : false,
                fk: fk.find((k) => k.localName === row[1])?.foreignName || null
            } as DatabaseTableColumn))
        } catch (rejection) {
            return [
                {
                    id: 1,
                    name: 'Error Loading Data',
                    type: (rejection as { err: string}).err
                } as DatabaseTableColumn
            ]
        }
    }

    /**
     * Retrieve the table/column values in the current context.
     * 
     * @returns Array of table objects, with column details.
     */
    public async getTables (): Promise<Array<DatabaseTable>> {
        // Retrieve our table information
        const tables: Array<DatabaseTable> = []
        for (const tableDetails of await this.getTableDetails()) {
            tables.push({
                name: tableDetails.name,
                type: tableDetails.type,
                definition: tableDetails.definition,
                columns: await this.getTableColumns(tableDetails.name)
            })
        }

        // Sort by table name and finish
        tables.sort((a, b) => {
            if (a.name < b.name) {
                return -1
            }
            if (a.name > b.name) {
                return 1
            }
            return 0
        })
        return tables
    }

    /**
     * Populates the context's list of tables based on its SQL.js database.
     * 
     * @returns Promise of nothing.
     */
    public async loadTables (): Promise<void> {
        this.tables = await this.getTables()
    }

    /**
     * Convenience method to create new, empty query.
     * 
     * @param sql Optional query text to prepopulate.
     * @returns Nothing
     */
    public addQuery (sql?: string): void {
        const q = new DatabaseContextQuery
        if (sql) {
            q.text = sql
        }
        this.Queries.push(q)
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
        if (this.activeQueryIndex > index || (this.activeQueryIndex === index && index === (this.Queries.length - 1))) {
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

        BrowserMetaDB: null as DBWrapper|null,
        BrowserOriginalDefinitionsDB: null as DBWrapper|null,
        BrowserDefinitionsDB: null as DBWrapper|null,
        BrowserQueriesDB: null as DBWrapper|null,
        BrowserQueryResultsDB: null as DBWrapper|null,

        contexts: [] as Array<DatabaseContext>,
        activeContextId: -1,
        hasPendingChanges: false,
        isSavingContext: false,
        fontSizeOverride: 12,
        isAutocompletionEnabled: false
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

            // Configure our IndexedDB wrappers if needed
            if (this.BrowserMetaDB === null) {
                this.BrowserMetaDB = new DBWrapper('meta')
            }
            if (this.BrowserOriginalDefinitionsDB === null) {
                this.BrowserOriginalDefinitionsDB = new DBWrapper('original-definitions')
            }
            if (this.BrowserDefinitionsDB === null) {
                this.BrowserDefinitionsDB = new DBWrapper('definitions')
            }
            if (this.BrowserQueriesDB === null) {
                this.BrowserQueriesDB = new DBWrapper('queries')
            }
            if (this.BrowserQueryResultsDB === null) {
                this.BrowserQueryResultsDB = new DBWrapper('query-results')
            }

            // Check if we have any databases to populate from our browser
            // storage if SQL.js is properly configured
            if (this.contexts.length === 0) {
                const databases: Array<BrowserMetaSchema> = await this.BrowserMetaDB.getAllWithKeys()
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
            // Clear data from our IndexedDB databases
            if (this.BrowserMetaDB !== null) {
                this.BrowserMetaDB.deleteDatabase()
                this.BrowserMetaDB = null
            }
            if (this.BrowserOriginalDefinitionsDB !== null) {
                this.BrowserOriginalDefinitionsDB.deleteDatabase()
                this.BrowserOriginalDefinitionsDB = null
            }
            if (this.BrowserDefinitionsDB !== null) {
                this.BrowserDefinitionsDB.deleteDatabase()
                this.BrowserDefinitionsDB = null
            }
            if (this.BrowserQueriesDB !== null) {
                this.BrowserQueriesDB.deleteDatabase()
                this.BrowserQueriesDB = null
            }
            if (this.BrowserQueryResultsDB !== null) {
                this.BrowserQueryResultsDB.deleteDatabase()
                this.BrowserQueryResultsDB = null
            }

            // Clear our context records
            this.contexts = []
            this.activeContextId = -1

            // Re-initialize
            return this.init()
        },
        /**
         * Add a new database context based on a record from the browser store.
         * 
         * This method handles the necessary retrieval and conversion tasks to
         * get a fully-populated context from the different the supporting
         * browser stores based on the primary store's record.
         * 
         * @param database The primary browser store meta record to build from.
         * @returns A new, populated DatabaseContext based on the browser data.
         */
        add(database: BrowserMetaSchema): Promise<DatabaseContext> {
            return new Promise(async (resolve, reject) => {
                // Verify we have the resources we need
                if (this.BrowserDefinitionsDB === null || this.BrowserQueriesDB === null || this.BrowserQueryResultsDB === null) {
                    reject('Must call init() before adding a database')
                    return
                }

                // Retrieve supporting data for this meta record
                const definitionRecord: BrowserDefinitionsSchema = await this.BrowserDefinitionsDB.get(database.id as number)
                const queriesRecord: BrowserQueriesSchema = await this.BrowserQueriesDB.get(database.id as number)
                const texts: Array<string> = JSON.parse(queriesRecord.texts)
                const resultsRecord: BrowserQueryResultsSchema = await this.BrowserQueryResultsDB.get(database.id as number)
                const results: Array<Array<SqlJsTypes.QueryExecResult>> = JSON.parse(resultsRecord.results)
                const resultHeights: Array<Array<number>> = JSON.parse(resultsRecord.resultHeights)
                const queryData: Array<DatabaseContextQuery> = texts.map((text: string, i) => {
                    const q = new DatabaseContextQuery
                    q.text = text
                    q.results = results[i]
                    q.resultHeights = resultHeights[i]
                    return q
                })

                // Create a database context for this database
                const sqlDB = new SqlJsDBWrapper(definitionRecord.definition)
                const context = new DatabaseContext(
                    database.id as number,
                    database.name,
                    database,
                    texts,
                    sqlDB,
                    queryData
                )
                await context.loadTables()

                // Add and return the context
                this.contexts.push(context)
                resolve(context)
            })
        },
        async delete(id: number) {
            // Make sure it's safe to proceed
            if (this.BrowserMetaDB === null) {
                throw 'Must call init() before deleting a database'
            }

            // Find the correct database context
            const context = this.contexts.find((context) => context.id === id)
            if (!context) {
                throw `Could not find database context with ID ${id}`
            }

            // Delete the browser database
            await this.BrowserMetaDB.delete(id)
            await this.BrowserOriginalDefinitionsDB?.delete(id)
            await this.BrowserDefinitionsDB?.delete(id)
            await this.BrowserQueriesDB?.delete(id)
            await this.BrowserQueryResultsDB?.delete(id)

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
            if (this.BrowserMetaDB === null || this.BrowserOriginalDefinitionsDB === null || this.BrowserDefinitionsDB === null || this.BrowserQueriesDB === null || this.BrowserQueryResultsDB === null) {
                throw 'Must call init() before creating a database'
            }

            // Create an empty database
            const newDB = new SqlJsDBWrapper()

            // Apply the original definition commands if they were given,
            // iterating statements manually instead of using newDB.run() so we
            // don't run out of memory as easily
            for (let i = 0; i < originalDefinitionScripts.length; i++) {
                const originalDefinition = originalDefinitionScripts[i]
                await newDB.runStatements(originalDefinition, (value) => { this.creationProgressStatements = value })
                this.creationProgressScripts = 100.0 * (i + 1) / originalDefinitionScripts.length
            }

            // Create a browser database equivalent
            this.creationProgressIndeterminate = true
            const def = await newDB.exportToJSON()
            this.creationProgressIndeterminate = false
            const meta: BrowserMetaSchema = {
                name,
                definitionHash: await HashWrapper.getHashString(def),
                queryResultsHash: await HashWrapper.getHashString(JSON.stringify([]))
            }
            meta.id = (await this.BrowserMetaDB.add(meta)) as number

            // Populate required supporting elements for the browser database
            await this.BrowserOriginalDefinitionsDB.add({
                definition: def
            }, meta.id)
            await this.BrowserDefinitionsDB.add({
                definition: def
            }, meta.id)
            await this.BrowserQueriesDB.add({
                texts: JSON.stringify([])
            }, meta.id)
            await this.BrowserQueryResultsDB.add({
                results: JSON.stringify([]),
                resultHeights: JSON.stringify([])
            }, meta.id)

            // Create a database context for the new database
            const context = new DatabaseContext(
                meta.id,
                name,
                meta,
                [],
                newDB,
                []
            )
            await context.loadTables()

            // Add and return the context, setting it as the active context if
            // it's the only one
            this.contexts.push(context)
            if (this.contexts.length === 1) {
                this.activeContextId = meta.id
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
            activeQuery.resultHeights = []
            activeQuery.error = ''

            // Execute our current query statements and store the results
            activeQuery.isRunning = true
            activeQuery.results = await this.activeContext.SqlJsDatabase.runStatements(activeQuery.text, (value, result) => {
                activeQuery.progress = value
                if (result) {
                    activeQuery.results.push(result)
                    activeQuery.resultHeights.push(300)
                }
            })
                .catch((e) => {
                    if (e.err) {
                        activeQuery.error = e.err.message
                    }
                    if (e.results) {
                        return e.results
                    }
                })
            activeQuery.isRunning = false
            activeQuery.progress = 0
            await this.activeContext.loadTables()

            // Save changes to the browser if appropriate (logic is delegated)
            this.saveChangesToBrowser(this.activeContext.id)
        },
        async stop() {
            // Ensure there is a running query in the active context
            if (this.activeContext === null || this.activeQuery === null || !this.activeQuery.isRunning) {
                return
            }

            // Stop the query and put the database back into a usable state
            this.activeQuery.isStopping = true
            await this.activeContext.SqlJsDatabase.close()
            await this.activeContext.loadTables()

            // Reset our query's status values
            this.activeQuery.isRunning = false
            this.activeQuery.isStopping = false
            this.activeQuery.progress = 0
        },
        async restoreOriginalToBrowser(id: number) {
            if (this.BrowserOriginalDefinitionsDB === null) {
                throw 'Must call init() before restoring a database'
            }
            // Find the correct database context
            const context = this.contexts.find((context) => context.id === id)
            if (!context) {
                throw `Could not find database context with ID ${id}`
            }

            // Indicate that we are making a major change to lock the UI
            this.isInitializing = true

            // Close the current version of the SQL.js database
            context.SqlJsDatabase.close()

            // Replace the SQL.js database with its original
            const definitionRecord: BrowserDefinitionsSchema = await this.BrowserOriginalDefinitionsDB.get(context.BrowserDatabase.id as number)
            context.SqlJsDatabase = new SqlJsDBWrapper(definitionRecord.definition)

            // Store our "updated" definition as the new current
            await this.saveChangesToBrowser(id, 'definition')
            await context.loadTables()

            // Unlock the UI
            this.isInitializing = false
        },
        async saveChangesToBrowser(id: number, type?: 'definition'|'query'|'query-results'): Promise<boolean> {
            // If we're in the middle of *actually* saving pending changes,
            // ignore this call
            if (this.isSavingContext === true) {
                return new Promise((resolve) => { resolve(false) })
            }
            
            // Find the correct database context
            const context = this.contexts.find((context) => context.id === id)
            if (!context) {
                return new Promise((resolve, reject) => { reject(`Could not find database context with ID ${id}`) })
            }

            this.hasPendingChanges = true

            return new Promise((resolve, reject) => {
                // Cancel any pending save
                if (context.saveTimeoutID !== null) {
                    window.clearTimeout(context.saveTimeoutID)
                    context.saveTimeoutID = null

                    if (context.savePromiseResolve) {
                        context.savePromiseResolve(false)
                    }
                    context.savePromiseResolve = undefined
                }

                // Schedule a potential save action
                context.saveTimeoutID = window.setTimeout(async () => {
                    // Make sure it's safe to proceed
                    if (this.BrowserMetaDB === null || this.BrowserDefinitionsDB === null || this.BrowserQueriesDB === null || this.BrowserQueryResultsDB === null) {
                        reject('Must call init() before saving changes to browser')
                        return
                    }

                    this.isSavingContext = true
                    const databaseID = context.BrowserDatabase.id as number
                    let madeChanges = false

                    // Changes in data or structure
                    if (type === undefined || type === 'definition') {
                        // Get the current definition and the old definition
                        const newHash = await context.SqlJsDatabase.exportToHash()
                        const oldHash = context.BrowserDatabase.definitionHash

                        // If there have been changes, update the stored definition
                        // and our current table list
                        if (newHash !== oldHash) {
                            context.BrowserDatabase.definitionHash = newHash
                            context.tables = await context.getTables()
                            await this.BrowserDefinitionsDB.update(databaseID, {
                                definition: await context.SqlJsDatabase.exportToJSON()
                            })
                            madeChanges = true
                        }
                    }

                    // Changes to queries
                    if (type === undefined || type === 'query') {
                        // Get the current query list and the old query list
                        const newQueries = context.Queries.map((q) => q.text)
                        const newQueriesJSON = JSON.stringify(newQueries)
                        const oldQueries = JSON.stringify(context.BrowserQueries)

                        // If there have been changes, update the stored definition
                        if (newQueriesJSON !== oldQueries) {
                            context.BrowserQueries = newQueries
                            await this.BrowserQueriesDB.update(databaseID, {
                                texts: newQueriesJSON
                            })
                            madeChanges = true
                        }
                    }

                    // Changes to query results
                    if (type === undefined || type === 'query-results') {
                        // Get the current results and the old results
                        const newResults = context.Queries.map((q) => ({ results: q.results, resultHeights: q.resultHeights }))
                        const newHash = await HashWrapper.getHashString(JSON.stringify(newResults))
                        const oldHash = context.BrowserDatabase.queryResultsHash

                        // If there have been changes, update the stored values
                        if (newHash !== oldHash) {
                            context.BrowserDatabase.queryResultsHash = newHash
                            await this.BrowserQueryResultsDB.update(databaseID, {
                                results: JSON.stringify(newResults.map((r) => r.results)),
                                resultHeights: JSON.stringify(newResults.map((r) => r.resultHeights))
                            })
                            madeChanges = true
                        }
                    }

                    // Finalize our actions
                    resolve(madeChanges)
                    this.hasPendingChanges = false

                    // Clear the timeout value
                    context.saveTimeoutID = null
                    context.savePromiseResolve = undefined
                    this.isSavingContext = false
                }, 1000)
                context.savePromiseResolve = resolve
            })
        }
    }
})
