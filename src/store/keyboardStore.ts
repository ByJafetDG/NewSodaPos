import { create } from 'zustand'

export type KeyboardMode = 'alpha' | 'numeric'

interface OpenOpts {
    mode: KeyboardMode
    value: string
    onChange: (v: string) => void
    onEnter?: () => void
}

interface KeyboardState {
    isOpen: boolean
    mode: KeyboardMode
    value: string
    _onChange: ((v: string) => void) | null
    _onEnter: (() => void) | null

    open: (opts: OpenOpts) => void
    close: () => void
    pressKey: (key: string) => void
    syncValue: (v: string) => void  // called when external input changes (barcode scanner)
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
    isOpen: false,
    mode: 'alpha',
    value: '',
    _onChange: null,
    _onEnter: null,

    open: ({ mode, value, onChange, onEnter }) => {
        set({ isOpen: true, mode, value, _onChange: onChange, _onEnter: onEnter ?? null })
    },

    close: () => set({ isOpen: false, _onChange: null, _onEnter: null }),

    syncValue: (v) => {
        // Called when barcode scanner types into the real input directly
        set({ value: v })
        get()._onChange?.(v)
    },

    pressKey: (key) => {
        const { value, _onChange, _onEnter } = get()
        let next = value

        if (key === 'BACKSPACE') {
            next = value.slice(0, -1)
        } else if (key === 'CLEAR') {
            next = ''
        } else if (key === 'ENTER') {
            _onEnter?.()
            set({ isOpen: false, _onChange: null, _onEnter: null })
            return
        } else if (key === 'SPACE') {
            next = value + ' '
        } else {
            next = value + key
        }

        set({ value: next })
        _onChange?.(next)
    },
}))
