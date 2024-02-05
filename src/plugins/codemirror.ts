import {
    history
} from '@codemirror/commands'

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
    history(),
    lineNumbers(),
    highlightActiveLine(),
    scrollPastEnd(),
    syntaxHighlighting(defaultHighlightStyle),
    sql({
        dialect: SQLite
    })
]
