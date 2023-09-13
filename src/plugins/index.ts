// Plugins
import { loadFonts } from './webfontloader'
import vuetify from './vuetify'
import pinia from '../store'
import router from '../router'
import VueCodemirror from 'vue-codemirror'
import CodemirrorExtensions from './codemirror'

// Types
import type { App } from 'vue'

export function registerPlugins (app: App) {
  loadFonts()
  app
    .use(vuetify)
    .use(router)
    .use(pinia)
    .use(VueCodemirror, {
      extensions: CodemirrorExtensions
    })
}
