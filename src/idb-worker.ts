import { IDBWrapper } from '@/idb-wrapper'

// Defines a subclassification of the message data
type MessageType =
    'deleteDatabase'
    |'add'
    |'get'
    |'getAllWithKeys'
    |'update'
    |'delete'
;

// Defines the expected contents of incoming messages
interface MessageData {
    database: string
    type: MessageType
}

interface MessageDataAdd extends MessageData {
    value: any
    key?: IDBValidKey
}

interface MessageDataGet extends MessageData {
    query: IDBValidKey|IDBKeyRange
}

interface MessageDataGetAllWithKeys extends MessageData {
    keyPropName: string
}

interface MessageDataUpdate extends MessageData {
    key: IDBValidKey
    values: { [key: string]: any }
}
interface MessageDataDelete extends MessageData {
    key: IDBValidKey|IDBKeyRange
}

onmessage = function (ev) {
    const data: MessageData = ev.data
    const idb = new IDBWrapper('sql-trainer', data.database)

    // Generic handler to use for all our message success responses
    const handler = (res: any) => {
        this.postMessage(res)
    }

    switch (data.type) {
        case 'deleteDatabase': {
            idb.deleteDatabase()
                .then(handler)
            break
        }
        case 'add': {
            const d = data as MessageDataAdd
            idb.add(d.value, d.key)
                .then(handler)
            break
        }
        case 'get': {
            const d = data as MessageDataGet
            idb.get(d.query)
                .then(handler)
            break
        }
        case 'getAllWithKeys': {
            const d = data as MessageDataGetAllWithKeys
            idb.getAllWithKeys(d.keyPropName)
                .then(handler)
            break
        }
        case 'update': {
            const d = data as MessageDataUpdate
            idb.update(d.key, d.values)
                .then(handler)
            break
        }
        case 'delete': {
            const d = data as MessageDataDelete
            idb.delete(d.key)
                .then(handler)
            break
        }
    }
}
