<template>
    <v-container class="fill-height">
        <v-row class="fill-height">
            <v-col>
                <v-row>
                    <v-col>
                        <v-select
                            v-model="databasesStore.activeContextId"
                            :items="databasesStore.contexts"
                            item-title="name"
                            item-value="id"
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
    </v-container>
</template>

<script lang="ts">
import { mapStores } from 'pinia'
import { useDatabasesStore } from '@/store/databases'

import { Codemirror } from 'vue-codemirror'

export default {
    data() {
        return {
        }
    },
    computed: {
        ...mapStores(useDatabasesStore)
    },
    async mounted() {
        await this.databasesStore.init()
        if (this.databasesStore.contexts.length === 0) {
            const newDB = await this.databasesStore.create('Sample Starter')
            newDB.SqlJsDatabase.run('CREATE TABLE TableA (ID int, DataPoint int)')
            newDB.SqlJsDatabase.run('INSERT INTO TableA (ID, DataPoint) VALUES (1,1), (2,1), (3,2)')
            this.databasesStore.saveChangesToBrowser(newDB.id)
        }
    },
    components: {
        Codemirror
    }
}
</script>
