<template>
  <v-app>
    <v-app-bar>
      <v-app-bar-title>{{ databasesStore.activeContext?.name || '(no database selected)' }}</v-app-bar-title>
    </v-app-bar>
    <v-main>
      <router-view></router-view>
    </v-main>
  </v-app>
</template>

<script lang="ts">
import { mapStores } from 'pinia'
import { useDatabasesStore } from '@/store/databases'

export default {
  computed: {
    ...mapStores(useDatabasesStore)
  }
}
</script>
