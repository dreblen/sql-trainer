import initSqlJs from 'sql.js'
import type * as SqlJsTypes from 'sql.js'

/**
 * Promised-based wrapper providing access to SQL.js for the application.
 * 
 * This is essentially a convenience to reduce reuse of initialization logic
 * between the worker and non-worker database access methods.
 */
export class SqlJsWrapper {
    /**
     * Create a new SQL.js instance.
     * 
     * @returns SQL.js instance.
     */
    public static getSqlJs (): Promise<SqlJsTypes.SqlJsStatic> {
        return initSqlJs({
            locateFile: filename => `/${filename}`
        })
    }
}
