import {
    lineNumbers,
    highlightActiveLine
} from '@codemirror/view'

import {
    syntaxHighlighting,
    defaultHighlightStyle
} from '@codemirror/language'

import { SQLite, sql } from '@codemirror/lang-sql'

export default [
    lineNumbers(),
    highlightActiveLine(),
    syntaxHighlighting(defaultHighlightStyle),
    sql({
        dialect: SQLite
    })
]
