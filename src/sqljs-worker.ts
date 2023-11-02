// Defines a subclassification of the message data
type MessageType =
    'stringify'
    |'parse'
;

// Defines the expected contents of incoming messages
interface MessageData {
    type: MessageType
    data: any
}

// Simple handler to convert an exported SQL.js database to an array, since it
// would otherwise block the UI for a potentially significant amount of time
onmessage = function (m) {
    const data = m.data as MessageData
    switch (data.type) {
        case 'stringify': {
            const asArray = Array.from(data.data)
            this.postMessage(JSON.stringify(asArray))
            break
        }
        case 'parse': {
            this.postMessage(JSON.parse(data.data))
            break
        }
    }
    
}
