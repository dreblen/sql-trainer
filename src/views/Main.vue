<template>
    <v-container class="fill-height">
        <v-row class="fill-height">
            <v-col>
                <v-row>
                    <v-col>
                        <v-select
                            v-model="databasesStore.activeContextId"
                            :items="databaseOptions"
                            label="Database"
                        />
                    </v-col>
                    <v-col
                        cols="3"
                        sm="2"
                        md="1"
                    >
                        <v-btn
                            icon="mdi-plus"
                            @click.stop="showAddDatabaseDialog = true"
                        />
                    </v-col>
                </v-row>
                <template v-if="databasesStore.activeContext !== null && databasesStore.activeQuery !== null">
                    <v-tabs>
                        <v-tab
                            v-for="(query,i) in databasesStore.activeContext.Queries"
                            :key="i"
                        >
                            Query {{ i + 1 }}
                        </v-tab>
                        <v-tab>+</v-tab>
                    </v-tabs>
                    <v-row style="height: 40vh;">
                        <v-col style="height: 100%;">
                            <v-card style="height: 100%;">
                                <codemirror
                                    v-model="databasesStore.activeQuery.text"
                                    placeholder="Type Your Query Text Here..."
                                    style="height: 100%;"
                                />
                            </v-card>
                        </v-col>
                    </v-row>
                    <v-row>
                        <v-col>
                            <v-btn @click="databasesStore.run">Run Query</v-btn>
                        </v-col>
                    </v-row>
                    <template
                        v-for="(resultset,i) in databasesStore.activeQuery.results"
                        :key="i"
                    >
                        <v-row>
                            <v-col>
                                <v-card variant="outlined">
                                    <v-table
                                        density="compact"
                                        fixed-header
                                        height="300px"
                                    >
                                        <thead>
                                            <tr>
                                                <th
                                                    v-for="(colName,i) in resultset.columns"
                                                    :key="i"
                                                    class="text-left"
                                                >
                                                    {{ colName }}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr
                                                v-for="(row,i) in resultset.values"
                                                :key="i"
                                            >
                                                <td
                                                    v-for="(colVal,j) in row"
                                                    :key="j"
                                                    class="text-left"
                                                >
                                                    {{ colVal }}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </v-table>
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
                                    <v-checkbox
                                        v-model="addDatabaseDialogFromScratch"
                                        label="Start from Scratch?"
                                    />
                                </v-col>
                            </v-row>
                            <v-row>
                                <v-col>
                                    <v-file-input
                                        v-model="addDatabaseDialogFiles"
                                        :loading="addDatabaseDialogFileLoading"
                                        :disabled="addDatabaseDialogFileLoading || addDatabaseDialogFromScratch"
                                        accept=".sql,text/plain"
                                        label="Definition File"
                                        @click:clear="addDatabaseDialogFileText = ''"
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
    </v-container>
</template>

<script lang="ts">
import { mapStores } from 'pinia'
import { useDatabasesStore } from '@/store/databases'

import { Codemirror } from 'vue-codemirror'

export default {
    data() {
        return {
            showAddDatabaseDialog: false,
            addDatabaseDialogFromScratch: false,
            addDatabaseDialogFileLoading: false,
            addDatabaseDialogFiles: [] as Array<File>,
            addDatabaseDialogFileText: '',
            addDatabaseDialogName: ''
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
                && (this.addDatabaseDialogFromScratch === true || this.addDatabaseDialogFileText !== '')
                && (this.addDatabaseDialogName !== '')
        }
    },
    watch: {
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
            const fileText: string = await new Promise((resolve, reject) => {
                const reader = new FileReader()
                reader.onabort = (ev) => {
                    reject(ev)
                }
                reader.onerror = (ev) => {
                    reject(ev)
                }
                reader.onload = () => {
                    resolve(reader.result as string)
                }
                reader.readAsText(file)
            })

            // Store a sanitized version of this file text
            this.addDatabaseDialogFileText = fileText.replaceAll('\r','')
            
            // Read the first line to see if it contains a usable name (as
            // identify by a hashbang-like comment)
            const lines = this.addDatabaseDialogFileText.split('\n')
            if (lines.length > 0 && lines[0].startsWith('--#!')) {
                this.addDatabaseDialogName = lines[0].substring(4)
            }

            // Stop our loading indicator
            this.addDatabaseDialogFileLoading = false
        }
    },
    methods: {
        addDatabaseFromDialog: async function () {
            // Create our database based on the dialog values, and set it as our
            // currently active context
            const newDB = await this.databasesStore.create(this.addDatabaseDialogName, this.addDatabaseDialogFileText)
            this.databasesStore.activeContextId = newDB.id

            // Reset the dialog values
            this.addDatabaseDialogFromScratch = false
            this.addDatabaseDialogFiles = []
            this.addDatabaseDialogFileText = ''
            this.addDatabaseDialogName = ''
            this.showAddDatabaseDialog = false
        }
    },
    async mounted() {
        await this.databasesStore.init()
    },
    components: {
        Codemirror
    }
}
</script>
