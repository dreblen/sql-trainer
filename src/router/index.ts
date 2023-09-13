import { createRouter, createWebHashHistory } from 'vue-router'
import Main from '@/views/Main.vue'

// Define our routes
const routes = [
    {
        path: '/',
        component: Main
    }
]

// Create our router
const router = createRouter({
    history: createWebHashHistory(),
    routes
})

export default router
