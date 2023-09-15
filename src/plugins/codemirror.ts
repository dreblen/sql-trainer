import {
    lineNumbers,
    highlightActiveLine,
    scrollPastEnd
} from '@codemirror/view'

import {
    syntaxHighlighting,
    defaultHighlightStyle
} from '@codemirror/language'

import { SQLite, sql } from '@codemirror/lang-sql'

export default [
    lineNumbers(),
    highlightActiveLine(),
    scrollPastEnd(),
    syntaxHighlighting(defaultHighlightStyle),
    sql({
        dialect: SQLite
    })
]
