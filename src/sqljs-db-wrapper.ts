import SqlJsDBWorker from '@/sqljs-db-worker?worker'
import { SqlJsWrapper } from './sqljs-wrapper'
import type * as SqlJsTypes from 'sql.js'

// Alias for SQL.js database definition values that are byte-like
type ByteDefinition = ArrayLike<number>|Buffer

/**
 * Public instance values from the SqlJsDBWrapper class. See its definitions for
 * more details.
 */
export interface ISqlJsDBWrapper {
    exportToJSON (): Promise<string>
    exec (sql: string): Promise<Array<SqlJsTypes.QueryExecResult>>
    close (): Promise<void>
    runStatements (sql: string, onprogress?: (value: number, result?: SqlJsTypes.QueryExecResult) => void): Promise<Array<SqlJsTypes.QueryExecResult>>
}

/**
 * Promised-based wrapper providing access to SQL.js databases for the
 * application.
 * 
 * If possible, it uses a Web Worker to handle the interactions with the SQL.js
 * database to avoid UI blocking, but if Web Worker is not available, it will
 * use SQL.js directly. This is the high-level API that everything in the app
 * should use.
 */
export class SqlJsDBWrapper implements ISqlJsDBWrapper {

    /**
     * Create a new wrapper for a SQL.js database instance.
     * 
     * @param definition A byte-like array of data, or a string that can be JSON
     * parsed into one, or null/undefined to start with no definition.
     */
    constructor(definition?: ByteDefinition|string|null) {
        // Make our basic distinction of whether or not we can use a Worker in
        // this instance
        if (typeof(Worker) !== 'undefined') {
            this.isWorker = true
        } else {
            this.isWorker = false
        }

        // Initialize property values
        this.worker = null
        this.workerIsLocked = false
        this.db = null
        this.definition = definition
    }

    ////////////////////////////////////////////////////////////////////////////
    // Properties
    ////////////////////////////////////////////////////////////////////////////

    /**
     * Whether or not this instance supports a Worker.
     */
    private isWorker: boolean

    /**
     * The Worker for this instance, or null if one has not been initialized.
     * This will always be null if the instance is not using a Worker.
     */
    private worker: Worker|null

    /**
     * Whether or not the worker is currently occupied processing something.
     * Because of the messaging system and not wanting to create multiple
     * workers, we must maintain an exclusive lock on the worker at any given
     * time.
     */
    private workerIsLocked: boolean

    /**
     * The SQL.js database for this instance, or null if one has not been
     * initialized. This will always be null if the instance is using a Worker.
     */
    private db: SqlJsTypes.Database|null

    /**
     * The original definition for the database instance, as provided in the
     * constructor.
     */
    private definition?: ByteDefinition|string|null

    ////////////////////////////////////////////////////////////////////////////
    // Methods
    ////////////////////////////////////////////////////////////////////////////

    /**
     * Creates a new Web Worker to interact with SQL.js.
     * 
     * It is assumed that this worker will be used in the context of a Promise,
     * so it accepts resolve and reject methods to wrap them in the worker's
     * message events. It also accepts an optional progress method that will be
     * called if the worker sends a progress update value.
     * 
     * @param resolve Promise resolve method.
     * @param reject Promise reject method.
     * @param progress Event handler for the worker's progress indication.
     * @param noWait If true, the locking logic for the worker will be ignored
     * and the worker instance will be returned immediately. Use with caution.
     * @returns New Worker object.
     */
    private async getWorker (resolve: (value: any) => void, reject: (reason?: any) => void, progress?: (value: number, result?: SqlJsTypes.QueryExecResult) => void, noWait?: boolean): Promise<Worker> {
        // When we receive a message from the worker, handle special values
        // based on a type classifier, but otherwise call our resolve method
        // using whatever value was sent in the message
        const onmessage = (m: MessageEvent<any>) => {
            if (m.data && m.data.type) {
                switch (m.data.type) {
                    // Error messages should trigger a rejection. They are still
                    // treated as a message instead of via the onerror handler
                    // exclusively because it gives more consistent results to
                    // handle the rejection upstream.
                    case 'error': {
                        reject(m.data.value)
                        this.workerIsLocked = false
                        break
                    }
                    // Progress messages contain a numerical value (0..100)
                    // indicating how far along the processing task is. We
                    // call the given progress method if appropriate, or just
                    // ignore the value without resolving.
                    case 'progress': {
                        if (progress) {
                            progress(m.data.value, m.data.result)
                        }
                        break
                    }
                }
            } else {
                resolve(m.data)
                this.workerIsLocked = false
            }
        }

        // If we get an error from the worker, call our reject method. This does
        // not catch all error situations, which is why we also have rejection
        // logic in the onmessage handler.
        const onerror = (err: ErrorEvent) => {
            reject(err)
            this.workerIsLocked = false
        }

        // Create the worker object from scratch if needed, or reuse the
        // existing one, making sure our current onmessage and onerror handlers
        // are the ones that will be used by the worker going forward
        if (this.worker === null) {
            // Use a promise so we can give the worker some time to initialize
            this.workerIsLocked = true
            return new Promise((resolve, reject) => {
                this.worker = new SqlJsDBWorker()

                // The init message will send back a message when the worker is
                // ready to use, so we define a temporary onmessage handler to
                // wait for this indication, replace our temporary handlers with
                // the better ones defined above, and finally resolve our worker
                this.worker.onmessage = () => {
                    const w = this.worker as Worker
                    w.onmessage = onmessage
                    w.onerror = onerror
                    resolve(w)
                }
                this.worker.onerror = (e) => { reject(e) }
                this.worker.postMessage({
                    type: 'init',
                    definition: this.definition
                })
            })
        } else {
            // Wait for the worker to be available
            if (noWait !== true) {
                while (this.workerIsLocked) {
                    await new Promise((resolve) => {
                        setTimeout(() => { resolve(null) }, 500)
                    })
                }
            }

            // Claim and return the worker
            this.workerIsLocked = true
            this.worker.onmessage = onmessage
            this.worker.onerror = onerror
            return new Promise((resolve) => { resolve(this.worker as Worker) })
        }
    }

    /**
     * Creates a new SQL.js database to use when needed, or returns the existing
     * one for the class.
     * 
     * @returns A SQL.js database to use for non-worker data handling.
     */
    private async getSqlJsDB (): Promise<SqlJsTypes.Database> {
        if (this.db === null) {
            // Normalize our definition into a byte-like definition
            if (typeof this.definition === 'string') {
                this.definition = JSON.parse(this.definition)
            }
            this.db = new (await (SqlJsWrapper.getSqlJs())).Database(this.definition as ByteDefinition)
        }
        return this.db
    }

    /**
     * Get JSON-formatted representation of current database definition.
     * 
     * @returns JSON string of the current database definition.
     */
    public exportToJSON (): Promise<string> {
        if (this.isWorker) {
            return new Promise(async (resolve, reject) => {
                const worker = await this.getWorker(resolve, reject)
                worker.postMessage({
                    type: 'exportToJSON'
                })
            })
        } else {
            return new Promise(async (resolve, reject) => {
                try {
                    const db = await this.getSqlJsDB()
                    const asArray = Array.from(db.export())
                    resolve(JSON.stringify(asArray))
                } catch (e) {
                    reject(e)
                }
            })
        }
    }

    /**
     * Execute all statements in a SQL string.
     * 
     * @param sql The SQL text to execute.
     * @returns The simple results of the execution, excluding sets for any
     * statements that had no rows.
     */
    public async exec (sql: string): Promise<Array<SqlJsTypes.QueryExecResult>> {
        if (this.isWorker) {
            return new Promise(async (resolve, reject) => {
                const worker = await this.getWorker(resolve, reject)
                worker.postMessage({
                    type: 'exec',
                    sql
                })
            })
        } else {
            return (await this.getSqlJsDB()).exec(sql)
        }
    }

    /**
     * Dispose of the current database instance.
     * 
     * If this instance is using a Worker, the worker will also be terminated.
     * 
     * @returns Promise of nothing.
     */
    public async close (): Promise<void> {
        if (this.isWorker && this.worker !== null) {
            // Don't worry about waiting for a valid lock, since we're trying
            // to forcibly close/dispose anyway
            return new Promise(async (resolve, reject) => {
                const worker = await this.getWorker(() => {
                    worker.terminate()
                    this.worker = null
                    resolve()
                }, reject, undefined, true)
                worker.postMessage({
                    type: 'close'
                })
            })
        } else {
            return (await this.getSqlJsDB()).close()
        }
    }

    /**
     * Run individual statements in a query, returning results for each
     * statement and indicating progress by statement.
     * 
     * Results will be included for every successful statement, even if it
     * produced no rows. Execution will stop with the first error, but results
     * up to that point will still be included in the promise rejection.
     * 
     * @param sql The SQL text to execute.
     * @param onprogress Method to call whenever a statement is finished,
     * providing a numerical representation (0..100) of the overall completion
     * and optionally the query result associated with the step of progress.
     * @returns List of results, one for each statement.
     */
    public async runStatements (sql: string, onprogress?: (value: number, result?: SqlJsTypes.QueryExecResult) => void): Promise<Array<SqlJsTypes.QueryExecResult>> {
        if (this.isWorker) {
            return new Promise(async (resolve, reject) => {
                const worker = await this.getWorker(resolve, reject, onprogress)
                worker.postMessage({
                    type: 'runStatements',
                    sql
                })
            })
        } else {
            // Split our query text into individual statements and iterate them
            // so we have more control over the formatting of the results (i.e.,
            // we're basically doing the same as SqlJsDatabase.exec() but we
            // want to do things like include empty result sets)
            const db = await this.getSqlJsDB()
            const statements = await db.iterateStatements(sql)
            const results: Array<SqlJsTypes.QueryExecResult> = []
            let totalBytes = statements.getRemainingSQL().length
            let bytesProcessed = 0

            return new Promise((resolve, reject) => {
                const statementReader = (statements: any, next: any) => {
                    try {
                        // The statement iterator will throw an exception if it
                        // encounters an invalid statement, but we can still use
                        // the results we gather up to the point of the error.
                        const it = statements.next()
                        if (it.done) {
                            resolve(results)
                            return
                        }
        
                        // Read our statement's basic information and update
                        // our progress within the full query
                        const statement = it.value
                        const rawSQL = statement.getSQL()
                        const statementSQL = rawSQL.trimStart()
                        bytesProcessed += rawSQL.length
                        if (onprogress) {
                            onprogress(100.0 * bytesProcessed / totalBytes)
                        }

                        // Store the column names (for SELECT-type queries)
                        const columns = statement.getColumnNames()

                        // Gather our row data if applicable (for SELECT-type)
                        const rows = []
                        while (statement.step()) {
                            rows.push(statement.get())
                        }

                        // Get the number of rows affected (for INSERT/UPDATE/
                        // DELETE statements only, not SELECTs or DDL
                        // statements)
                        let numRows = 0
                        if (statementSQL.startsWith('INSERT') || statementSQL.startsWith('UPDATE') || statementSQL.startsWith('DELETE')) {
                            numRows = db.getRowsModified()
                        }

                        // Store the results of this statement. If there were no
                        // column headings, we assume it was something where we
                        // care about the number of rows affected and not the
                        // rows.
                        results.push({
                            columns,
                            values: (columns.length > 0) ?
                                rows :
                                [[numRows as SqlJsTypes.SqlValue]]
                        })

                        // Clean up the statement
                        statement.free()

                        // Queue the next iteration
                        setTimeout(() => {
                            next(statements, next)
                        })
                    } catch (err) {
                        reject({
                            err,
                            results
                        })
                    }
                }
    
                statementReader(statements, statementReader)
            })
        }
    }
}
