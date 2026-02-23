import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { useEffect, useState } from "react"
import { useDebounce } from "@/lib/hooks/use-debounce" // We might need to create this hook if it doesn't exist

export function SearchInput({ value, onChange }: { value: string, onChange: (value: string) => void }) {
    const [localValue, setLocalValue] = useState(value)
    const debouncedValue = useDebounce(localValue, 500)

    useEffect(() => {
        setLocalValue(value)
    }, [value])

    useEffect(() => {
        onChange(debouncedValue)
    }, [debouncedValue, onChange])

    return (
        <div className="relative w-full max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Search files..."
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                className="pl-8 h-9"
            />
        </div>
    )
}
