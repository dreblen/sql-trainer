/**
 * This helper script reads the current package.json file looking for license
 * details for its full dependencies. These details are then written to a
 * separate JSON file that can be read by the app to display licenses for
 * bundled packages.
 */
const PackageJson = require('../package.json')
const fs = require('fs').promises

// We will look for files with one of these names, in order, when 
const licenseFiles = [
    'LICENSE',
    'LICENSE.md',
    'COPYRIGHT',
    'COPYRIGHT.md'
]

// Wrap our logic as an async function so we can use await
async function main () {
    // Prepare a container for our result values
    const results = []

    // Iterate package.json dependencies
    for (const dep in PackageJson.dependencies) {
        let hasFile = false
        let contents = ''
        for (const filename of licenseFiles) {
            try {
                contents = (await fs.readFile(`node_modules/${dep}/${filename}`)).toString()
                hasFile = true
                break
            } catch {
                // no-op
            }
        }

        // If we found no file, report the error
        if (hasFile === false) {
            console.log(`Could not find license file for '${dep}'`)
        }

        // Either way, make an entry for the package
        results.push({
            name: dep,
            license: contents
        })
    }

    // Store our results in a separate JSON file (we intentionally do not catch
    // the potential error so it gets reported with full exception details)
    await fs.writeFile('src/package-licenses.json', JSON.stringify(results))
}
main()
