<template>
  <v-app>
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
