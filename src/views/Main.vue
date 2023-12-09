<template>
    <v-container class="fill-height">
        <v-row
            class="fill-height"
            style="width: 100%;"
        >
            <v-col>
                <v-row>
                    <v-col>
                        <v-select
                            v-model="databasesStore.activeContextId"
                            :items="databaseOptions"
                            label="Database"
                            :loading="databasesStore.isInitializing"
                            :disabled="databasesStore.isInitializing"
                            :hide-details="!showDatabaseControls || databasesStore.activeContext === null"
                        >
                            <template v-slot:prepend v-if="databasesStore.activeContext !== null">
                                <v-checkbox
                                    v-model="showDatabaseControls"
                                    hide-details
                                    color="primary"
                                >
                                    <template v-slot:input>
                                        <v-icon
                                            class="pa-5"
                                            @click="showDatabaseControls = !showDatabaseControls"
                                        >
                                            mdi-cog
                                        </v-icon>
                                    </template>
                                </v-checkbox>
                            </template>
                            <template v-slot:append>
                                <v-btn
                                    icon="mdi-plus"
                                    @click.stop="showAddDatabaseDialog = true"
                                />
                            </template>
                            <template v-slot:append-inner>
                                <v-icon v-if="!databasesStore.hasPendingChanges">mdi-check-circle</v-icon>
                                <v-progress-circular
                                    v-else
                                    indeterminate
                                    size="22"
                                />
                            </template>
                            <template v-slot:details>
                                <v-container>
                                    <v-row>
                                        <v-col>
                                            <v-btn
                                                block
                                                prepend-icon="mdi-undo"
                                                @click="databasesStore.restoreOriginalToBrowser(databasesStore.activeContextId)"
                                            >
                                                Restore to Original
                                            </v-btn>
                                        </v-col>
                                        <v-col>
                                            <v-btn
                                                block
                                                prepend-icon="mdi-delete"
                                                @click="databasesStore.delete(databasesStore.activeContextId)"
                                            >
                                                Remove Completely
                                            </v-btn>
                                        </v-col>
                                        <v-col>
                                            <v-btn
                                                block
                                                prepend-icon="mdi-table"
                                                @click="showTableSummaryDrawer = true"
                                            >
                                                Table Summary
                                            </v-btn>
                                        </v-col>
                                    </v-row>
                                </v-container>
                            </template>
                        </v-select>
                    </v-col>
                </v-row>
                <template v-if="databasesStore.activeContext !== null && databasesStore.activeQuery !== null && !databasesStore.isInitializing">
                    <v-row>
                        <v-col
                            cols="9"
                            sm="10"
                            md="11"
                        >
                            <v-tabs
                                v-model="activeTabIndex"
                                color="primary"
                                center-active
                                show-arrows
                            >
                                <v-tab
                                    v-for="(query,i) in databasesStore.activeContext.Queries"
                                    :key="i"
                                >
                                    Query {{ i + 1 }}
                                    <v-btn
                                        icon="mdi-close"
                                        size="x-small"
                                        variant="plain"
                                        @click.stop="databasesStore.activeContext.removeQuery(i)"
                                    />
                                </v-tab>
                            </v-tabs>
                        </v-col>
                        <v-col
                            cols="3"
                            sm="2"
                            md="1"
                        >
                            <v-btn
                                style="float: right;"
                                icon="mdi-plus"
                                @click="databasesStore.activeContext.addQuery()"
                            />
                        </v-col>
                    </v-row>
                    <v-row class="my-0">
                        <v-col>
                            <v-slider
                                v-model="editorHeight"
                                density="compact"
                                hide-details
                                color="secondary"
                                prepend-icon="mdi-arrow-split-horizontal"
                                min="0"
                                max="90"
                            >
                            </v-slider>
                        </v-col>
                    </v-row>
                    <v-row class="my-0" :style="`height: ${editorHeight}vh;`">
                        <v-col style="height: 100%;">
                            <v-card style="height: 100%;">
                                <codemirror
                                    v-model="databasesStore.activeQuery.text"
                                    placeholder="Type Your Query Text Here..."
                                    style="height: 100%;"
                                    @keyup="editorKeyUp"
                                />
                            </v-card>
                        </v-col>
                    </v-row>
                    <v-row>
                        <v-col>
                            <v-btn
                                color="primary"
                                block
                                @click="databasesStore.run"
                                id="btnRunQuery"
                                :loading="databasesStore.activeQuery.isRunning"
                            >
                                Run Query (<kbd>F9</kbd>)
                                <template v-slot:loader>
                                    <v-progress-linear
                                        v-model="databasesStore.activeQuery.progress"
                                        stream
                                        height="20"
                                        color="secondary"
                                    >
                                        <template v-slot:default="{ value }">
                                            Running Query... ({{ value.toFixed(0) }}%)
                                        </template>
                                    </v-progress-linear>
                                </template>
                            </v-btn>
                        </v-col>
                    </v-row>
                    <v-row v-if="databasesStore.activeQuery.isRunning">
                        <v-col>
                            <v-btn
                                color="error"
                                block
                                @click="databasesStore.stop"
                                :disabled="databasesStore.activeQuery.isStopping"
                                :loading="databasesStore.activeQuery.isStopping"
                            >
                                Stop Query
                                <template v-slot:loader>
                                    <v-progress-linear
                                        stream
                                        height="20"
                                        color="error"
                                    >
                                        <template v-slot:default>
                                            Stopping Query...
                                        </template>
                                    </v-progress-linear>
                                </template>
                            </v-btn>
                        </v-col>
                    </v-row>
                    <template
                        v-for="(resultset,setNum) in databasesStore.activeQuery.results"
                        :key="setNum"
                    >
                        <v-row>
                            <v-col>
                                <v-card variant="outlined">
                                    <!-- The table is intentionally placed
                                    outside of the card text so it fills to the
                                    edges of the card-->
                                    <template v-if="resultset.columns.length > 0">
                                        <v-card-text>
                                            <v-container>
                                                <v-row>
                                                    <v-col>
                                                        <v-slider
                                                            v-model="databasesStore.activeQuery.resultHeights[setNum]"
                                                            density="compact"
                                                            hide-details
                                                            color="secondary"
                                                            prepend-icon="mdi-arrow-split-horizontal"
                                                            thumb-label
                                                            min="0"
                                                            max="600"
                                                            @end="onResultHeightSliderEnd"
                                                        >
                                                            <template v-slot:thumb-label="{ modelValue }">
                                                                {{ Math.max(0, Math.ceil((modelValue - 50) / 36)) }}&nbsp;rows
                                                            </template>
                                                            <template v-slot:append>
                                                                {{ resultset.values.length }}
                                                            </template>
                                                        </v-slider>
                                                    </v-col>
                                                </v-row>
                                            </v-container>
                                        </v-card-text>
                                        <v-data-table-virtual
                                            fixed-header
                                            :headers="[{ title: '#', key: '0', sortable: false, width: '1em' },...resultset.columns.map((c, i) => ({ title: c, key: (i+1).toString(), sortable: false }))]"
                                            :items="mapResultValues(resultset.values)"
                                            :height="databasesStore.activeQuery.resultHeights[setNum]"
                                            density="compact"
                                        >
                                            <template
                                                v-for="(col, i) in ['#',...resultset.columns]"
                                                :key="i"
                                                v-slot:[`item.${i.toString()}`]="{ item }"
                                            >
                                                <span v-if="item.columns[i.toString()] === null">
                                                    <v-chip color="#885400">
                                                        NULL
                                                    </v-chip>
                                                </span>
                                                <span v-else style="white-space: nowrap;">
                                                    {{ item.columns[i.toString()] }}
                                                </span>
                                            </template>
                                        </v-data-table-virtual>
                                    </template>
                                    <template v-else>
                                        <div style="height: 100px;" class="pa-3">
                                            {{ `${resultset.values[0]} row(s) affected.` }}
                                        </div>
                                    </template>
                                </v-card>
                            </v-col>
                        </v-row>
                    </template>
                    <template v-if="databasesStore.activeQuery.error !== ''">
                        <v-row>
                            <v-col>
                                <v-card>
                                    <v-card-title>Query Error</v-card-title>
                                    <v-card-text>{{ databasesStore.activeQuery.error }}</v-card-text>
                                </v-card>
                            </v-col>
                        </v-row>
                    </template>
                </template>
            </v-col>
        </v-row>
        <v-dialog
            v-model="showAddDatabaseDialog"
            width="auto"
            min-width="20em"
            :persistent="addDatabaseDialogIsSaving"
        >
            <v-card>
                <v-card-title>
                    <span class="text-h4">Add Database</span>
                </v-card-title>
                <v-card-text>
                    <v-form>
                        <v-container>
                            <v-row>
                                <v-col>
                                    <v-select
                                        v-model="addDatabaseDialogStartFromSelection"
                                        :items="addDatabaseDialogStartFromOptions"
                                        label="Starting Point..."
                                    />
                                </v-col>
                            </v-row>
                            <v-row
                                v-if="addDatabaseDialogStartFromSelection === 1"
                            >
                                <v-col>
                                    <v-file-input
                                        v-model="addDatabaseDialogFiles"
                                        :loading="addDatabaseDialogFileLoading"
                                        :disabled="addDatabaseDialogFileLoading"
                                        accept=".zip,.sql,text/plain"
                                        label="Definition File"
                                        @click:clear="addDatabaseDialogFileTexts = []; addDatabaseDialogScriptError = ''"
                                        :error-messages="addDatabaseDialogScriptError"
                                    />
                                </v-col>
                            </v-row>
                            <v-row>
                                <v-col>
                                    <v-text-field
                                        v-model="addDatabaseDialogName"
                                        label="Database Name"
                                    />
                                </v-col>
                            </v-row>
                        </v-container>
                    </v-form>
                    <v-progress-linear
                        color="primary"
                        v-model="databasesStore.creationProgressScripts"
                        :indeterminate="databasesStore.creationProgressIndeterminate"
                        :stream="addDatabaseDialogIsSaving && !databasesStore.creationProgressIndeterminate"
                    />
                    <v-progress-linear
                        color="primary"
                        v-model="databasesStore.creationProgressStatements"
                        :indeterminate="databasesStore.creationProgressIndeterminate"
                        :stream="addDatabaseDialogIsSaving && !databasesStore.creationProgressIndeterminate"
                    />
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn
                        color="primary"
                        variant="elevated"
                        :disabled="!addDatabaseDialogAddButtonEnabled"
                        @click="addDatabaseFromDialog"
                    >
                        Add
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
        <v-navigation-drawer
            v-if="databasesStore.activeContext !== null"
            v-model="showTableSummaryDrawer"
            :width="tableSummaryDrawerWidth"
        >
            <v-list>
                <v-list-item>
                    <v-slider
                        v-model="tableSummaryDrawerWidth"
                        density="compact"
                        hide-details
                        prepend-icon="mdi-arrow-split-vertical"
                        min="256"
                        max="800"
                        class="my-1 mr-5"
                    />
                    <template v-slot:append>
                        <v-btn
                            icon="mdi-close"
                            size="x-small"
                            variant="tonal"
                            @click="showTableSummaryDrawer = false"
                        />
                    </template>
                </v-list-item>
                <v-list-item>
                    <v-list-item-title>
                        <v-text-field
                            v-model="tableSummaryFilterText"
                            label="Filter Tables..."
                            density="compact"
                            variant="outlined"
                            :hide-details="true"
                            class="mr-2"
                        />
                    </v-list-item-title>
                </v-list-item>
                <v-list-group
                    v-for="table in filteredTables"
                    :key="table.name"
                    :value="table.name"
                >
                    <template v-slot:activator="{ props }">
                        <v-list-item
                            v-bind="props"
                            style="background: grey; color: white;"
                        >
                            <v-list-item-title>
                                <v-icon v-if="table.columns.length > 0 && table.columns[0].name === 'Error Loading Data'">
                                    mdi-alert-circle
                                </v-icon>
                                {{ table.name }}
                            </v-list-item-title>
                        </v-list-item>
                    </template>
                    <v-list-item
                        v-for="column in table.columns"
                        :key="column.id"
                        :append-icon="column.isPK ? 'mdi-key' : undefined"
                    >
                        <v-list-item-title>{{ column.name }}</v-list-item-title>
                        <v-list-item-subtitle>
                            {{ column.type }}
                            <span v-if="column.name !== 'Error Loading Data'">
                                {{ `, ${column.allowNull ? 'NULL' : 'NOT NULL'}` }}
                            </span>
                        </v-list-item-subtitle>
                        <v-list-item-subtitle v-if="column.fk">
                            {{ `(${column.fk})` }}
                        </v-list-item-subtitle>
                    </v-list-item>
                </v-list-group>
            </v-list>
        </v-navigation-drawer>
    </v-container>
</template>

<script lang="ts">
import { mapStores } from 'pinia'
import { useDatabasesStore } from '@/store/databases'

import { Codemirror } from 'vue-codemirror'
import JSZip from 'jszip'
import { SqlValue } from 'sql.js'

export default {
    data() {
        return {
            showAddDatabaseDialog: false,
            addDatabaseDialogStartFromOptions: [
                { value: 1, title: 'From a Definition File' },
                { value: 2, title: 'From Scratch'}
            ],
            addDatabaseDialogStartFromSelection: 1,
            addDatabaseDialogFileLoading: false,
            addDatabaseDialogFiles: [] as Array<File>,
            addDatabaseDialogFileTexts: [] as Array<string>,
            addDatabaseDialogName: '',
            addDatabaseDialogIsSaving: false,
            addDatabaseDialogScriptError: '',

            showDatabaseControls: false,

            showTableSummaryDrawer: false,
            tableSummaryDrawerWidth: 256,
            tableSummaryFilterText: '',

            editorHeight: 40,
            activeTabIndex: 0
        }
    },
    computed: {
        ...mapStores(useDatabasesStore),
        databaseOptions: function () {
            const databases = this.databasesStore.contexts.map((context) => {
                return {
                    title: context.name,
                    value: context.id
                }
            })
            if (databases.length === 0) {
                databases.push({
                    title: '(none available)',
                    value: -1
                })
            }
            return databases
        },
        addDatabaseDialogAddButtonEnabled: function () {
            return (this.addDatabaseDialogFileLoading === false)
                && (this.addDatabaseDialogStartFromSelection === 2 || this.addDatabaseDialogFileTexts.length > 0)
                && (this.addDatabaseDialogName !== '')
                && (this.addDatabaseDialogIsSaving === false)
        },
        activeDatabaseQueryIndex: function () {
            return this.databasesStore.activeContext?.activeQueryIndex
        },
        activeDatabaseQueryText: function () {
            return this.databasesStore.activeQuery?.text
        },
        activeDatabaseNumQueries: function () {
            return this.databasesStore.activeContext?.Queries.length || 0
        },
        numDatabaseContexts: function () {
            return this.databasesStore.contexts.length
        },
        filteredTables: function () {
            if (this.databasesStore.activeContext === null) {
                return []
            } else {
                return this.databasesStore.activeContext.tables.filter(
                    (table) => table.name.toLowerCase().includes(this.tableSummaryFilterText.toLowerCase())
                )
            }
        }
    },
    watch: {
        activeDatabaseQueryIndex: function (newIndex: number) {
            // Nothing to do if this was a change to something unusable
            if (newIndex === undefined) {
                return
            }

            // Make sure our active tab matches the store value
            if (newIndex !== this.activeTabIndex) {
                this.activeTabIndex = newIndex
            }
        },
        activeDatabaseQueryText: function () {
            this.databasesStore.saveChangesToBrowser(this.databasesStore.activeContextId, 'query')
        },
        activeDatabaseNumQueries: function () {
            this.databasesStore.saveChangesToBrowser(this.databasesStore.activeContextId, 'query')
        },
        numDatabaseContexts: function (newNum: number) {
            if (newNum === 0) {
                this.showAddDatabaseDialog = true
            }
        },
        activeTabIndex: function (newIndex: number) {
            // Nothing to do if we don't have an active context
            if (!this.databasesStore.activeContext) {
                return
            }

            // If we've been unset (e.g., due to removing a tab), then revert
            // to whatever the current query index value is on the store side.
            // Otherwise, set the query index to match the new value if needed.
            if (newIndex === undefined) {
                this.activeTabIndex = this.databasesStore.activeContext.activeQueryIndex
            } else {
                if (newIndex !== this.databasesStore.activeContext.activeQueryIndex) {
                    this.databasesStore.activeContext.activeQueryIndex = newIndex
                }
            }
        },
        addDatabaseDialogFiles: async function (files) {
            // If we don't have a selection, there's nothing to do
            if (!files || files.length === 0) {
                return
            }

            // Mark our file-selector as loading
            this.addDatabaseDialogFileLoading = true

            // We don't allow selection of multiples, so we always want the
            // first file in the list
            const file = files[0]
            const fileBuffer: ArrayBuffer = await new Promise((resolve, reject) => {
                const reader = new FileReader()
                reader.onabort = (ev) => {
                    reject(ev)
                }
                reader.onerror = (ev) => {
                    reject(ev)
                }
                reader.onload = () => {
                    resolve(reader.result as ArrayBuffer)
                }
                reader.readAsArrayBuffer(file)
            })

            // Treat the file differently depending on whether it was plaintext
            // SQL or a ZIP bundle; either way, we end up with a list of one or
            // more script texts to execute as part of our default definition
            // for this database
            const texts = []
            if (file.name.endsWith('.zip')) {
                const zipper = new JSZip()
                try {
                    const zip = await zipper.loadAsync(file)
                    const filenames = Object.keys(zip.files).sort()
                    for (const filename of filenames) {
                        texts.push(await zip.files[filename].async('string'))
                    }
                } catch (e) {
                    console.log('Error reading content from ZIP file: ', e)
                    this.addDatabaseDialogFileLoading = false
                    return
                }
            } else {
                texts.push(new TextDecoder().decode(fileBuffer))
            }

            // Sanitize and permanently store all our file texts
            for (const i in texts) {
                texts[i] = texts[i].replaceAll('\r','')
            }
            this.addDatabaseDialogFileTexts = texts
            
            // Read the first line of the first file to see if it contains a
            // usable name (as identify by a hashbang-like comment)
            const lines = this.addDatabaseDialogFileTexts[0].split('\n')
            if (lines.length > 0 && lines[0].trimStart().startsWith('--#!')) {
                this.addDatabaseDialogName = lines[0].trimStart().substring(4)
            }

            // Stop our loading indicator
            this.addDatabaseDialogFileLoading = false
        }
    },
    methods: {
        addDatabaseFromDialog: async function () {
            this.addDatabaseDialogIsSaving = true

            // Create our database based on the dialog values, and set it as our
            // currently active context
            const initTexts = (this.addDatabaseDialogStartFromSelection === 1) ? this.addDatabaseDialogFileTexts : []
            try {
                const newDB = await this.databasesStore.create(this.addDatabaseDialogName, initTexts)
                this.databasesStore.activeContextId = newDB.id

                // Reset the dialog values
                this.addDatabaseDialogStartFromSelection = 1
                this.addDatabaseDialogFiles = []
                this.addDatabaseDialogFileTexts = []
                this.addDatabaseDialogName = ''
                this.showAddDatabaseDialog = false
            } catch (err) {
                this.addDatabaseDialogScriptError = (err as Error).message
                this.databasesStore.creationProgressScripts = 0
                this.databasesStore.creationProgressStatements = 0
            } finally {
                this.addDatabaseDialogIsSaving = false
            }
        },
        editorKeyUp: function (ev: KeyboardEvent) {
            if (ev.key === 'F9') {
                // No matter what, run the active query
                this.databasesStore.run()

                // If possible, trigger a ripple on the run query button so the
                // user can see that something happened
                const btnRunQuery = document.getElementById('btnRunQuery')
                if (!btnRunQuery) {
                    return
                }

                // Generate an event simulating pressing the Enter key on the
                // run query button
                const enterdown: KeyboardEvent = new KeyboardEvent('keydown', {
                    // Using deprecated keyCode because that's what v-btn
                    // looks for with its ripple
                    keyCode: 13,
                    key: 'Enter'
                })
                btnRunQuery.dispatchEvent(enterdown)

                // Generate an event simulating letting go of the Enter key on
                // the run query button
                const enterup = new KeyboardEvent('keyup', {
                    keyCode: 13,
                    key: 'Enter'
                })
                btnRunQuery.dispatchEvent(enterup)
            }
        },
        onResultHeightSliderEnd: function () {
            this.databasesStore.saveChangesToBrowser(this.databasesStore.activeContextId, 'query')
        },
        mapResultValues: function (values: SqlValue[][]) {
            return values.map((row, i) => {
                const o: {[key: string]: SqlValue} = {}
                o['0'] = i + 1
                for (const i in row) {
                    o[(parseInt(i) + 1).toString()] = row[i]
                }
                return o
            })
        }
    },
    async mounted() {
        await this.databasesStore.init()
        if (this.databasesStore.contexts.length === 0) {
            this.showAddDatabaseDialog = true
        }
    },
    components: {
        Codemirror
    }
}
</script>
