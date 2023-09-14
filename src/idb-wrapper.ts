/**
 * Simple Promise-based wrapper around IndexedDB API.
 * 
 * Resulting object works with one store within one database. Currently does not
 * include any logic regarding version upgrades.
 */
export class IDBWrapper {
    /**
     * 
     * @param dbName The name of the database to wrap.
     * @param storeName The name of the object store to wrap.
     */
    constructor(dbName: string, storeName: string) {
        this.dbName = dbName
        this.storeName = storeName
    }

    ////////////////////////////////////////////////////////////////////////////
    // Properties
    ////////////////////////////////////////////////////////////////////////////

    private dbName: string
    private storeName: string

    ////////////////////////////////////////////////////////////////////////////
    // Methods
    ////////////////////////////////////////////////////////////////////////////

    /**
     * Opens and returns the database described by the constructor. If our
     * wrapped data
     * 
     * @returns The raw IndexedDB database object.
     */
    public getDatabase (): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName)

            // Handle the case where we need to set up our schema
            req.onupgradeneeded = (ev: any) => {
                const db: IDBDatabase = ev.target.result

                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, {
                        autoIncrement: true
                    })
                }
            }

            // Handle normal success/failure
            req.onsuccess = (ev: any) => {
                resolve(ev.target.result)
            }
            req.onerror = (ev: any) => {
                reject(ev)
            }
        })
    }

    /**
     * Get a transaction object for the wrapped database.
     * 
     * @param mode The intended operation type for the transaction.
     * @returns A raw IndexedDB transaction object.
     */
    public getTransaction (mode?: IDBTransactionMode): Promise<IDBTransaction> {
        return new Promise((resolve, reject) => {
            this.getDatabase()
            .then((db) => {
                resolve(db.transaction(this.storeName, mode))
            })
            .catch((err) => {
                reject(err)
            })
        })
    }

    /**
     * Create a new record in the wrapped database.
     * 
     * @param value The object to store.
     * @param key The key value for the object (if not included in the value).
     * @returns The key value for the new object.
     */
    public add (value: any, key?: IDBValidKey): Promise<IDBValidKey> {
        return new Promise((resolve, reject) => {
            this.getTransaction('readwrite')
            .then((tran) => {
                const store = tran.objectStore(this.storeName)
                const req = store.add(value, key)
                req.onsuccess = (ev: any) => {
                    resolve(ev.target.result)
                }
                req.onerror = (ev: any) => {
                    reject(ev)
                }
            })
        })
    }

    /**
     * Retrieve all record keys from the wrapped database.
     * 
     * @returns All row key values.
     */
    public getAllKeys (): Promise<Array<IDBValidKey>> {
        return new Promise((resolve, reject) => {
            this.getTransaction()
            .then((tran) => {
                const store = tran.objectStore(this.storeName)
                const req = store.getAllKeys()
                req.onsuccess = (ev: any) => {
                    resolve(ev.target.result)
                }
                req.onerror = (ev: any) => {
                    reject(ev)
                }
            })
        })
    }

    /**
     * Retrieve all records from the wrapped database.
     * 
     * @returns All row objects.
     */
    public getAll (): Promise<Array<any>> {
        return new Promise((resolve, reject) => {
            this.getTransaction()
            .then((tran) => {
                const store = tran.objectStore(this.storeName)
                const req = store.getAll()
                req.onsuccess = (ev: any) => {
                    resolve(ev.target.result)
                }
                req.onerror = (ev: any) => {
                    reject(ev)
                }
            })
        })
    }

    /**
     * Get specific value(s) from the wrapped database.
     * 
     * @param query The key or range to retrieve.
     * @returns The specified object(s), if found.
     */
    public get (query: IDBValidKey|IDBKeyRange): Promise<any> {
        return new Promise((resolve, reject) => {
            this.getTransaction()
            .then((tran) => {
                const store = tran.objectStore(this.storeName)
                const req = store.get(query)
                req.onsuccess = (ev: any) => {
                    resolve(ev.target.result)
                }
                req.onerror = (ev: any) => {
                    reject(ev)
                }
            })
        })
    }

    /**
     * Retrieve all records from the wrapped database, adding a property to each
     * that represents is key value.
     * 
     * @param keyPropName The property name in which to store the key value.
     * @returns All row objects.
     */
    public getAllWithKeys (keyPropName = 'id'): Promise<Array<any>> {
        // Get all the keys first
        return this.getAllKeys()
        .then((keys) => {
            // Retrieve each individual record by key
            const lookups = []
            for (const key of keys) {
                lookups.push(this.get(key))
            }
            return Promise.all(lookups)
            .then((values) => {
                // Add our key property to each value
                for (const i in values) {
                    values[i][keyPropName] = keys[i]
                }
                return values
            })
        })
    }

    /**
     * Adds or updates a whole record.
     * 
     * @param value The object to store.
     * @param key The key value for the object (if not included in the value).
     * @returns The key value for the new/modified object.
     */
    public put (value: any, key?: IDBValidKey): Promise<IDBValidKey> {
        return new Promise((resolve, reject) => {
            this.getTransaction('readwrite')
            .then((tran) => {
                const store = tran.objectStore(this.storeName)
                const req = store.put(value, key)
                req.onsuccess = (ev: any) => {
                    resolve(ev.target.result)
                }
                req.onerror = (ev: any) => {
                    reject(ev)
                }
            })
        })
    }

    /**
     * Updates select values for a specific record.
     * 
     * @param key The key value for the object to update.
     * @param values The values to change.
     * @returns The number of rows affected.
     */
    public update (key: IDBValidKey, values: { [key: string]: any }): Promise<number> {
        return new Promise((resolve, reject) => {
            // Get the current version of the object
            this.get(key)
            .then((current: any) => {
                // If we couldn't find the item, then resolve with 0 rows
                if (!current) {
                    resolve(0)
                    return
                }

                // Update all the object's values to match the desired updates
                for (const key of Object.keys(values)) {
                    current[key] = values[key]
                }

                // Store our changes
                this.put(current, key)
                .then(() => {
                    resolve(1)
                })
                .catch((err) => {
                    reject(err)
                })
            })
            .catch((err) => {
                reject(err)
            })
        })
    }

    /**
     * Remove specific value(s) from the wrapped database.
     * 
     * @param query The key or range to retrieve.
     * @returns Promise of nothing
     */
    public delete (key: IDBValidKey|IDBKeyRange): Promise<undefined> {
        return new Promise((resolve, reject) => {
            this.getTransaction('readwrite')
            .then((tran) => {
                const store = tran.objectStore(this.storeName)
                const req = store.delete(key)
                req.onsuccess = () => {
                    resolve(undefined)
                }
                req.onerror = (ev: any) => {
                    reject(ev)
                }
            })
        })
    }
}
