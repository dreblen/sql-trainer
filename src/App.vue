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
          </v-container>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<script lang="ts">
import { mapStores } from 'pinia'
import { useDatabasesStore } from '@/store/databases'

export default {
  data() {
    return {
      showDetailsDialog: false,
      deleteAllIsProcessing: false
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
      }
    }
  }
}
</script>
