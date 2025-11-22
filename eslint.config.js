import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import js from '@eslint/js'
import globals from 'globals'

export default defineConfigWithVueTs(
  pluginVue.configs['flat/essential'],
  js.configs.recommended,
  vueTsConfigs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      }
    },
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  }
)
