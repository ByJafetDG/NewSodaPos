import { useCallback, useRef } from 'react'
import { useKeyboardStore, type KeyboardMode } from '@/store/keyboardStore'

interface UseKeyboardInputOptions {
    mode?: KeyboardMode
    onEnter?: () => void
    /**
     * Pass a ref set to `true` to suppress the keyboard on the very next focus.
     * Useful when programmatically focusing (e.g. switching to scan mode) so the
     * barcode scanner is ready without the keyboard popping up.
     * The flag auto-resets to false after the first suppressed focus.
     */
    suppressRef?: React.MutableRefObject<boolean>
}

export function useKeyboardInput(
    value: string,
    onChange: (v: string) => void,
    options: UseKeyboardInputOptions = {}
) {
    const { open, syncValue, isOpen } = useKeyboardStore()
    const { mode = 'alpha', onEnter, suppressRef } = options

    const handleFocus = useCallback(() => {
        if (suppressRef?.current) {
            suppressRef.current = false
            return  // silent focus — barcode scanner ready, no keyboard
        }
        open({ mode, value, onChange, onEnter })
    }, [mode, value, onChange, onEnter, open, suppressRef])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value
        onChange(newVal)
        if (isOpen) syncValue(newVal)
    }, [onChange, isOpen, syncValue])

    return {
        onFocus: handleFocus,
        onChange: handleChange,
        value,
        autoComplete: 'off',
        autoCorrect: 'off',
        spellCheck: false,
    }
}

/** Convenience: returns a ref you can pass as `suppressRef` */
export function useSuppressKeyboard() {
    return useRef(false)
}
