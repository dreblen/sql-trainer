import IDBWorker from '@/idb-worker?worker'
import { IDBWrapper } from '@/idb-wrapper'

/**
 * Promised-based wrapper providing access to IndexedDB for the application.
 * 
 * If possible, it uses a Web Worker to handle the interactions with IndexedDB
 * to avoid UI blocking, but if Web Worker is not available, it will use the
 * IndexedDB wrapper directly. This is the high-level API that everything in the
 * app should use.
 */
export class DBWrapper {
    constructor() {
        if (typeof(Worker) !== 'undefined') {
            this.isWorker = true
        } else {
            this.isWorker = false
        }
        this.idb = null
    }

    ////////////////////////////////////////////////////////////////////////////
    // Properties
    ////////////////////////////////////////////////////////////////////////////

    private isWorker: boolean
    private idb: IDBWrapper|null

    ////////////////////////////////////////////////////////////////////////////
    // Methods
    ////////////////////////////////////////////////////////////////////////////

    /**
     * Creates a new Web Worker to interact with IndexedDB.
     * 
     * It is assumed that this worker will be used in the context of a Promise,
     * so it accepts resolve and reject methods to wrap them in the worker's
     * message events.
     * 
     * @param resolve Promise resolve method.
     * @param reject Promise reject method.
     * @returns New Worker object.
     */
    private getWorker (resolve: (value: any) => void, reject: (reason?: any) => void): Worker {
        const w = new IDBWorker()
        const dispose = function () {
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
        return w
    }

    /**
     * Creates a new IDBWrapper object to use when needed, or returns the
     * existing one for the class.
     * 
     * @returns An IDBWrapper instance to use for non-worker data handling.
     */
    private getIDBWrapper (): IDBWrapper {
        if (this.idb === null) {
            this.idb = new IDBWrapper('sql-trainer', 'trainerDatabases')
        }
        return this.idb
    }

    /**
     * Completely removes the database and its object stores.
     * 
     * @returns null
     */
    public deleteDatabase(): Promise<null> {
        if (this.isWorker) {
            return new Promise((resolve, reject) => {
                const worker = this.getWorker(resolve, reject)
                worker.postMessage({
                    type: 'deleteDatabase',
                })
            })
        } else {
            return this.getIDBWrapper().deleteDatabase()
        }
    }

    /**
     * Create a new record in the wrapped database.
     * 
     * @param value The object to store.
     * @param key The key value for the object (if not included in the value).
     * @returns The key value for the new object.
     */
    public add (value: any, key?: IDBValidKey): Promise<IDBValidKey> {
        if (this.isWorker) {
            return new Promise((resolve, reject) => {
                const worker = this.getWorker(resolve, reject)
                worker.postMessage({
                    type: 'add',
                    value,
                    key
                })
            })
        } else {
            return this.getIDBWrapper().add(value, key)
        }
    }

    /**
     * Get specific value(s) from the wrapped database.
     * 
     * @param query The key or range to retrieve.
     * @returns The specified object(s), if found.
     */
    public get (query: IDBValidKey|IDBKeyRange): Promise<any> {
        if (this.isWorker) {
            return new Promise((resolve, reject) => {
                const worker = this.getWorker(resolve, reject)
                worker.postMessage({
                    type: 'get',
                    query
                })
            })
        } else {
            return this.getIDBWrapper().get(query)
        }
    }

    /**
     * Retrieve all records from the wrapped database, adding a property to each
     * that represents is key value.
     * 
     * @param keyPropName The property name in which to store the key value.
     * @returns All row objects.
     */
    public getAllWithKeys (keyPropName = 'id'): Promise<Array<any>> {
        if (this.isWorker) {
            return new Promise((resolve, reject) => {
                const worker = this.getWorker(resolve, reject)
                worker.postMessage({
                    type: 'getAllWithKeys',
                    keyPropName
                })
            })
        } else {
            return this.getIDBWrapper().get(keyPropName)
        }
    }

    /**
     * Updates select values for a specific record.
     * 
     * @param key The key value for the object to update.
     * @param values The values to change.
     * @returns The number of rows affected.
     */
    public update (key: IDBValidKey, values: { [key: string]: any }): Promise<number> {
        if (this.isWorker) {
            return new Promise((resolve, reject) => {
                const worker = this.getWorker(resolve, reject)
                worker.postMessage({
                    type: 'update',
                    key,
                    values
                })
            })
        } else {
            return this.getIDBWrapper().update(key, values)
        }
    }

    /**
     * Remove specific value(s) from the wrapped database.
     * 
     * @param query The key or range to retrieve.
     * @returns Promise of nothing
     */
    public delete (key: IDBValidKey|IDBKeyRange): Promise<undefined> {
        if (this.isWorker) {
            return new Promise((resolve, reject) => {
                const worker = this.getWorker(resolve, reject)
                worker.postMessage({
                    type: 'delete',
                    key,
                })
            })
        } else {
            return this.getIDBWrapper().delete(key)
        }
    }
}
