// Simple handler to convert an exported SQL.js database to an array, since it
// would otherwise block the UI for a potentially significant amount of time
onmessage = function (m) {
    const asArray = Array.from(m.data)
    this.postMessage(JSON.stringify(asArray))
}
