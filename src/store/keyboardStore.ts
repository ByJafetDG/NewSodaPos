import { create } from 'zustand'
import type { RefObject } from 'react'

export type KeyboardMode = 'alpha' | 'numeric'

interface OpenOpts {
    mode: KeyboardMode
    value: string
    onChange: (v: string) => void
    onEnter?: () => void
    inputRef?: RefObject<HTMLInputElement | null>
}

interface KeyboardState {
    isOpen: boolean
    mode: KeyboardMode
    value: string
    cursorPos: number
    _onChange: ((v: string) => void) | null
    _onEnter: (() => void) | null
    _inputRef: RefObject<HTMLInputElement | null> | null

    open: (opts: OpenOpts) => void
    close: () => void
    pressKey: (key: string) => void
    syncValue: (v: string) => void
    setCursor: (pos: number) => void
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
    isOpen: false,
    mode: 'alpha',
    value: '',
    cursorPos: 0,
    _onChange: null,
    _onEnter: null,
    _inputRef: null,

    open: ({ mode, value, onChange, onEnter, inputRef }) => {
        set({
            isOpen: true,
            mode,
            value,
            cursorPos: value.length,
            _onChange: onChange,
            _onEnter: onEnter ?? null,
            _inputRef: inputRef ?? null,
        })
    },

    close: () => set({ isOpen: false, _onChange: null, _onEnter: null, _inputRef: null }),

    syncValue: (v) => {
        set({ value: v, cursorPos: v.length })
        get()._onChange?.(v)
    },

    setCursor: (pos) => set({ cursorPos: pos }),

    pressKey: (key) => {
        const { value, cursorPos, _onChange, _onEnter, _inputRef } = get()
        // Read real cursor from input if available; fall back to store's cursorPos
        const cursor = _inputRef?.current?.selectionStart ?? cursorPos
        let next = value
        let nextCursor = cursor

        if (key === 'BACKSPACE') {
            if (cursor > 0) {
                next = value.slice(0, cursor - 1) + value.slice(cursor)
                nextCursor = cursor - 1
            }
        } else if (key === 'CLEAR') {
            next = ''
            nextCursor = 0
        } else if (key === 'ENTER') {
            _onEnter?.()
            set({ isOpen: false, _onChange: null, _onEnter: null, _inputRef: null })
            return
        } else if (key === 'SPACE') {
            next = value.slice(0, cursor) + ' ' + value.slice(cursor)
            nextCursor = cursor + 1
        } else {
            next = value.slice(0, cursor) + key + value.slice(cursor)
            nextCursor = cursor + 1
        }

        set({ value: next, cursorPos: nextCursor })
        _onChange?.(next)

        // Restore cursor in the real input after React re-renders
        const domInput = _inputRef?.current
        if (domInput) {
            requestAnimationFrame(() => {
                domInput.setSelectionRange(nextCursor, nextCursor)
            })
        }
    },
}))
