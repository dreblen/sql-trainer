<template>
  <v-app>
    <v-main>
      <router-view></router-view>
    </v-main>
    <v-footer color="secondary">
      <v-row justify="center">
        <v-col class="text-center" cols="12">Copyright © 2023 Tanner Jotblad</v-col>
        <v-col cols="6" sm="4" md="2">
          <v-btn
            @click="showDetailsDialog = true"
            block
            variant="plain"
          >
            More Details
          </v-btn>
        </v-col>
      </v-row>
    </v-footer>
    <v-dialog
      v-model="showDetailsDialog"
      fullscreen
      transition="dialog-bottom-transition"
    >
      <v-card>
        <v-toolbar
          color="primary"
        >
          <v-toolbar-title>Application Details</v-toolbar-title>
          <v-spacer />
          <v-btn
            icon="mdi-close"
            @click="showDetailsDialog = false"
            :disabled="deleteAllIsProcessing"
          />
        </v-toolbar>
        <v-card-text>
          <v-container>
            <v-row>
              <v-col>
                <v-btn
                  @click="clearAllData()"
                  :loading="deleteAllIsProcessing"
                  :disabled="deleteAllIsProcessing"
                  block
                >
                  Delete All Database Content
                </v-btn>
              </v-col>
            </v-row>
            <v-row>
              <v-col>
                <h2>Software Licenses</h2>
                <p class="mb-3">This app is running with the help of the following bundled packages:</p>
                <v-expansion-panels
                  variant="accordion"
                >
                  <v-expansion-panel
                    v-for="(pack, i) in PackageLicenses"
                    :key="i"
                    :title="pack.name"
                  >
                    <v-expansion-panel-text>
                      <v-container>
                        <v-row>
                          <v-col>
                            <v-btn
                              block
                              append-icon="mdi-open-in-new"
                              :href="`https://www.npmjs.com/package/${pack.name}`"
                              target="blank"
                            >
                              Package Details
                            </v-btn>
                          </v-col>
                        </v-row>
                        <v-row>
                          <v-col>
                            <p
                              v-for="(line, j) in pack.license.split('\n\n')"
                              class="my-3"
                            >
                              {{ line + '&nbsp;' }}
                            </p>
                          </v-col>
                        </v-row>
                      </v-container>
                    </v-expansion-panel-text>
                  </v-expansion-panel>
                </v-expansion-panels>
              </v-col>
            </v-row>
          </v-container>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<script lang="ts">
import { mapStores } from 'pinia'
import { useDatabasesStore } from '@/store/databases'

// Fixed data file that gets updated via script/hook
import PackageLicenses from '@/package-licenses.json'

export default {
  data() {
    return {
      showDetailsDialog: false,
      deleteAllIsProcessing: false,
      PackageLicenses
    }
  },
  computed: {
    ...mapStores(useDatabasesStore)
  },
  methods: {
    clearAllData: async function () {
      this.deleteAllIsProcessing = true
      try {
        await this.databasesStore.clear()
      } finally {
        this.deleteAllIsProcessing = false
        this.showDetailsDialog = false
      }
    }
  }
}
</script>
