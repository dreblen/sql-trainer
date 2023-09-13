import { defineStore } from 'pinia'

import { IDBWrapper } from '@/idb-wrapper'

import initSqlJs from 'sql.js'
import type * as SqlJsTypes from 'sql.js'

// Represents the schema of our IndexedDB object store
interface TrainerDatabase {
    id?: number
    name: string
    originalDefinition: string
    currentDefinition: string
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
    constructor(id: number, name: string, BrowserDatabase: TrainerDatabase, SqlJsDatabase: SqlJsTypes.Database) {
        this.id = id
        this.name = name
        this.BrowserDatabase = BrowserDatabase
        this.SqlJsDatabase = SqlJsDatabase

        this.Queries = [
            new DatabaseContextQuery
        ]
        this.activeQueryIndex = 0

        this.saveTimeoutID = null
    }

    id: number
    name: string
    BrowserDatabase: TrainerDatabase
    SqlJsDatabase: SqlJsTypes.Database

    Queries: Array<DatabaseContextQuery>
    activeQueryIndex: number

    saveTimeoutID: number|null
}

export const useDatabasesStore = defineStore('databases', {
    state: () => ({
        BrowserDB: null as IDBWrapper|null,
        SqlJs: null as SqlJsTypes.SqlJsStatic|null,
        contexts: [] as Array<DatabaseContext>,
        activeContextId: -1
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
                // throw `Active query index value (${this.activeContext.activeQueryIndex}) is not valid`
                return null
            } else {
                return this.activeContext.Queries[this.activeContext.activeQueryIndex]
            }
        }
    },
    actions: {
        async init() {
            // Configure our IndexedDB wrapper if needed
            if (this.BrowserDB === null) {
                this.BrowserDB = new IDBWrapper('sql-trainer', 'trainerDatabases')
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
                        this.add(database)

                        // Set our default context to the last database
                        this.activeContextId = database.id as number
                    }
                }
            }
        },
        add(database: TrainerDatabase): DatabaseContext {
            // Make sure it's safe to proceed
            if (this.SqlJs === null) {
                throw 'Must call init() before adding a database'
            }

            // Create a database context for this database
            const sqlDB = new this.SqlJs.Database(JSON.parse(database.currentDefinition))
            const context = new DatabaseContext(
                database.id as number,
                database.name,
                database,
                sqlDB
            )

            // Add and return the context
            this.contexts.push(context)
            return context
        },
        async create(name: string, originalDefinition = ''): Promise<DatabaseContext> {
            // Make sure it's safe to proceed
            if (this.BrowserDB === null || this.SqlJs === null) {
                throw 'Must call init() before creating a database'
            }

            // Create an empty database
            const newDB = new this.SqlJs.Database()

            // Apply the original definition commands if they were given
            if (originalDefinition !== '') {
                newDB.run(originalDefinition)
            }

            // Create a browser database equivalent
            const def = this.exportSqlJsToJSON(newDB)
            const browserDB: TrainerDatabase = {
                name,
                originalDefinition: def,
                currentDefinition: def
            }
            browserDB.id = (await this.BrowserDB.add(browserDB)) as number

            // Create a database context for the new database
            const context = new DatabaseContext(
                browserDB.id,
                name,
                browserDB,
                newDB
            )

            // Add and return the context, setting it as the active context if
            // it's the only one
            this.contexts.push(context)
            if (this.contexts.length === 1) {
                this.activeContextId = browserDB.id
            }
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

            // Execute the query
            try {
                activeQuery.results = this.activeContext.SqlJsDatabase.exec(activeQuery.text)
            } catch (err) {
                activeQuery.error = (err as Error).message
            }

            // Save changes to the browser if appropriate (logic is delegated)
            this.saveChangesToBrowser(this.activeContext.id)
        },
        exportSqlJsToJSON(database: SqlJsTypes.Database) {
            const asArray = Array.from(database.export())
            return JSON.stringify(asArray)
        },
        async saveChangesToBrowser(id: number) {
            // Find the correct database context
            const context = this.contexts.find((context) => context.id === id)
            if (!context) {
                throw `Could not find database context with ID ${id}`
            }

            // Cancel any pending save
            if (context.saveTimeoutID !== null) {
                window.clearTimeout(context.saveTimeoutID)
                context.saveTimeoutID = null
            }

            // Schedule a potential save action
            context.saveTimeoutID = window.setTimeout(() => {
                // Get the current definition and the old definition
                const newDef = this.exportSqlJsToJSON(context.SqlJsDatabase)
                const oldDef = context.BrowserDatabase.currentDefinition

                // If there have been changes, update the stored definition
                if (newDef !== oldDef) {
                    context.BrowserDatabase.currentDefinition = newDef
                    const idb = new IDBWrapper('sql-trainer', 'trainerDatabases')
                    idb.update(context.id, {
                        currentDefinition: newDef
                    })
                }

                // Clear the timeout value
                context.saveTimeoutID = null
            }, 500)

            // TODO: During this process, give some kind of saving indicator
        }
    }
})
