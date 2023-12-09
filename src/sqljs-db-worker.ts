import { SqlJsWrapper } from './sqljs-wrapper';
import type * as SqlJsTypes from 'sql.js'

// Defines a subclassification of the message data
type MessageType =
    'init'
    |'exportToJSON'
    |'exec'
    |'close'
    |'runStatements'
;

// Defines the expected contents of incoming messages
interface MessageData {
    type: MessageType
    data: any
}

interface MessageDataInit {
    definition?: ArrayLike<number>|Buffer|string|null
}

interface MessageDataSQL extends MessageData {
    sql: string
}

// These variables cannot be used until defined via an "init" message
let SqlJs: SqlJsTypes.SqlJsStatic
let db: SqlJsTypes.Database

// Simple handler to convert an exported SQL.js database to an array, since it
// would otherwise block the UI for a potentially significant amount of time
onmessage = async function (m) {
    const data = m.data as MessageData

    switch (data.type) {
        case 'init': {
            const d = data as MessageDataInit
            if (typeof d.definition === 'string') {
                d.definition = JSON.parse(d.definition)
            }
            SqlJs = await SqlJsWrapper.getSqlJs()
            db = new SqlJs.Database(d.definition as ArrayLike<number>|Buffer|null)
            this.postMessage(true)
            break
        }
        case 'exportToJSON': {
            const asArray = Array.from(db.export())
            this.postMessage(JSON.stringify(asArray))
            break
        }
        case 'exec': {
            const d = data as MessageDataSQL
            if (!db) {
                return
            }
            try {
                this.postMessage(db.exec(d.sql))
            } catch (err) {
                this.postMessage({
                    type: 'error',
                    value: {
                        err
                    }
                })
            }
            break
        }
        case 'close': {
            if (!db) {
                return
            }
            this.postMessage(db.close())
            break
        }
        case 'runStatements': {
            const d = data as MessageDataSQL
            if (!db) {
                return
            }

            const statements = await db.iterateStatements(d.sql)
            const results: Array<SqlJsTypes.QueryExecResult> = []
            let totalBytes = statements.getRemainingSQL().length
            let bytesProcessed = 0
            while (true) {
                try {
                    const it = statements.next()
                    if (it.done) {
                        break
                    }

                    const statement = it.value
                    const rawSQL = statement.getSQL()
                    const statementSQL = rawSQL.trimStart()

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
                    const result: SqlJsTypes.QueryExecResult = {
                        columns,
                        values: (columns.length > 0) ?
                            rows :
                            [[numRows as SqlJsTypes.SqlValue]]
                    }
                    results.push(result)

                    // Clean up the statement
                    statement.free()

                    // Update our progress
                    bytesProcessed += rawSQL.length
                    this.postMessage({
                        type: 'progress',
                        value: 100.0 * bytesProcessed / totalBytes,
                        result
                    })
                } catch (err) {
                    this.postMessage({
                        type: 'error',
                        value: {
                            err,
                            results
                        }
                    })
                    return
                }
            }

            this.postMessage(results)
            break
        }
    }
}
