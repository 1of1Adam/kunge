import * as React from "react"
import { ChevronRight } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
} from "@/components/ui/sidebar"
import type { TreeItem, EncyclopediaData } from "@/types/encyclopedia"
import { convertToTreeData } from "@/types/encyclopedia"

// localStorage key for persisting state
const STORAGE_KEY = 'brooks-encyclopedia-state'

// Convert text to Title Case (first letter uppercase, rest lowercase)
// Preserves certain patterns like "Part 1", "A to B", abbreviations
function toTitleCase(text: string): string {
  // Words that should stay lowercase (unless at start)
  const lowercaseWords = new Set(['to', 'of', 'and', 'the', 'a', 'an', 'in', 'on', 'at', 'for'])

  // Known abbreviations to preserve (exact match, case-insensitive check)
  const preserveAbbreviations = new Set(['GD', 'GU', 'LL', 'HH', 'LH', 'HL', 'EMA', 'MTR', 'PB', 'AIL', 'AIS', 'TR', 'DB', 'DT', 'MM', 'BO', 'FOMC'])

  return text
    .split(' ')
    .map((word, index) => {
      // Keep "Part X" pattern as is
      if (/^Part$/i.test(word)) return 'Part'

      // Keep single uppercase letters (like "A", "B", "C")
      if (/^[A-Z]$/.test(word)) return word

      // Check if it's a known abbreviation (case-insensitive)
      const upperWord = word.toUpperCase()
      if (preserveAbbreviations.has(upperWord)) return upperWord

      // Handle hyphenated words
      if (word.includes('-')) {
        return word.split('-').map(part =>
          part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        ).join('-')
      }

      // Lowercase words (not at start of string)
      if (index > 0 && lowercaseWords.has(word.toLowerCase())) {
        return word.toLowerCase()
      }

      // Standard title case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

// Cache for toTitleCase results
const titleCaseCache = new Map<string, string>()
function cachedToTitleCase(text: string): string {
  if (!titleCaseCache.has(text)) {
    titleCaseCache.set(text, toTitleCase(text))
  }
  return titleCaseCache.get(text)!
}

// Build a map of child -> parent relationships for path tracing
function buildParentMap(items: TreeItem[], parentId: string | null = null): Map<string, string | null> {
  const map = new Map<string, string | null>()

  for (const item of items) {
    map.set(item.id, parentId)
    if (item.children) {
      const childMap = buildParentMap(item.children, item.id)
      childMap.forEach((value, key) => map.set(key, value))
    }
  }

  return map
}

// Get all ancestor IDs for a given node
function getAncestorIds(itemId: string, parentMap: Map<string, string | null>): Set<string> {
  const ancestors = new Set<string>()
  let currentId: string | null = parentMap.get(itemId) ?? null

  while (currentId) {
    ancestors.add(currentId)
    currentId = parentMap.get(currentId) ?? null
  }

  return ancestors
}

// Find item by ID in tree
function findItemById(items: TreeItem[], id: string): TreeItem | null {
  for (const item of items) {
    if (item.id === id) return item
    if (item.children) {
      const found = findItemById(item.children, id)
      if (found) return found
    }
  }
  return null
}

// Custom hook for debounced value
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value)

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}

interface EncyclopediaSidebarProps extends React.ComponentProps<typeof Sidebar> {
  data: EncyclopediaData
  onItemSelect?: (item: TreeItem) => void
  selectedItemId?: string
}

export function EncyclopediaSidebar({
  data,
  onItemSelect,
  selectedItemId,
  ...props
}: EncyclopediaSidebarProps) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const treeData = React.useMemo(() => convertToTreeData(data), [data])

  // Debounce search query for smoother typing (300ms delay)
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Build parent map for path tracing
  const parentMap = React.useMemo(() => buildParentMap(treeData), [treeData])

  // Auto-expand path when selectedItemId changes
  React.useEffect(() => {
    if (selectedItemId) {
      const ancestors = getAncestorIds(selectedItemId, parentMap)
      if (ancestors.size > 0) {
        setExpandedIds(prev => {
          const newSet = new Set(prev)
          ancestors.forEach(id => newSet.add(id))
          return newSet
        })
      }

      // Save to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedItemId }))
      } catch (e) {
        console.warn('Failed to save state to localStorage:', e)
      }
    }
  }, [selectedItemId, parentMap])

  // Toggle expand/collapse for a node
  const handleToggle = React.useCallback((itemId: string, isOpen: boolean) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev)
      if (isOpen) {
        newSet.add(itemId)
      } else {
        newSet.delete(itemId)
      }
      return newSet
    })
  }, [])

  // Memoize onItemSelect callback
  const handleItemSelect = React.useCallback((item: TreeItem) => {
    onItemSelect?.(item)
  }, [onItemSelect])

  // Filter tree based on debounced search query and collect matching IDs
  const { filteredTree, matchingIds } = React.useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return { filteredTree: treeData, matchingIds: new Set<string>() }
    }

    const query = debouncedSearchQuery.toLowerCase()
    const matching = new Set<string>()

    const filterTree = (items: TreeItem[]): TreeItem[] => {
      return items.reduce<TreeItem[]>((acc, item) => {
        const matchesLabel = item.label.toLowerCase().includes(query)
        const filteredChildren = item.children ? filterTree(item.children) : []

        if (matchesLabel || filteredChildren.length > 0) {
          // If this item matches or has matching children, add to results
          if (matchesLabel) {
            matching.add(item.id)
          }
          acc.push({
            ...item,
            children: filteredChildren.length > 0 ? filteredChildren : item.children,
          })
        }
        return acc
      }, [])
    }

    return { filteredTree: filterTree(treeData), matchingIds: matching }
  }, [treeData, debouncedSearchQuery])

  // Auto-expand all ancestors of matching items when searching
  React.useEffect(() => {
    if (debouncedSearchQuery.trim() && matchingIds.size > 0) {
      const idsToExpand = new Set<string>()

      // For each matching item, get all its ancestors
      matchingIds.forEach(id => {
        const ancestors = getAncestorIds(id, parentMap)
        ancestors.forEach(ancestorId => idsToExpand.add(ancestorId))
      })

      // Also expand the matching items themselves (if they have children)
      matchingIds.forEach(id => idsToExpand.add(id))

      setExpandedIds(idsToExpand)
    }
  }, [debouncedSearchQuery, matchingIds, parentMap])

  return (
    <Sidebar {...props}>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="px-2">
          <SidebarInput
            placeholder="Search patterns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <span>Table of Contents</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredTree.map((item) => (
                <MemoizedTreeNode
                  key={item.id}
                  item={item}
                  onItemSelect={handleItemSelect}
                  selectedItemId={selectedItemId}
                  expandedIds={expandedIds}
                  onToggle={handleToggle}
                  searchQuery={debouncedSearchQuery}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

// Export helper for restoring state from localStorage
export function getSavedState(): { selectedItemId?: string } | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

// Export findItemById for use in App
export { findItemById, toTitleCase }

// Highlight matching text in a string - memoized component
const HighlightText = React.memo(function HighlightText({
  text,
  highlight
}: {
  text: string
  highlight: string
}) {
  if (!highlight.trim()) {
    return <>{text}</>
  }

  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} className="font-semibold text-gray-900 border-b border-gray-400">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
})

interface TreeNodeProps {
  item: TreeItem
  onItemSelect: (item: TreeItem) => void
  selectedItemId?: string
  expandedIds: Set<string>
  onToggle: (itemId: string, isOpen: boolean) => void
  searchQuery: string
}

// Memoized TreeNode to prevent unnecessary re-renders
const MemoizedTreeNode = React.memo(function TreeNode({
  item,
  onItemSelect,
  selectedItemId,
  expandedIds,
  onToggle,
  searchQuery
}: TreeNodeProps) {
  const hasChildren = item.children && item.children.length > 0
  const isSelected = selectedItemId === item.id
  const isExpanded = expandedIds.has(item.id)

  // Use cached toTitleCase
  const displayLabel = cachedToTitleCase(item.label)

  // Memoize click handler
  const handleClick = React.useCallback(() => {
    onItemSelect(item)
  }, [onItemSelect, item])

  // Memoize toggle handler
  const handleToggleChange = React.useCallback((open: boolean) => {
    onToggle(item.id, open)
  }, [onToggle, item.id])

  if (!hasChildren) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isSelected}
          className="data-[active=true]:bg-sidebar-accent h-auto py-1 whitespace-normal"
          onClick={handleClick}
        >
          <span className={`text-left leading-snug text-sm ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
            <HighlightText text={displayLabel} highlight={searchQuery} />
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <Collapsible
        className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
        open={isExpanded}
        onOpenChange={handleToggleChange}
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            isActive={isSelected}
            className="h-auto py-1 whitespace-normal"
            onClick={handleClick}
          >
            <ChevronRight className={`size-3.5 shrink-0 transition-transform duration-200 ${isSelected ? 'text-gray-900' : 'text-gray-500'}`} />
            <span className={`text-left leading-snug text-sm ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
              <HighlightText text={displayLabel} highlight={searchQuery} />
            </span>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children?.map((child) => (
              <MemoizedTreeNode
                key={child.id}
                item={child}
                onItemSelect={onItemSelect}
                selectedItemId={selectedItemId}
                expandedIds={expandedIds}
                onToggle={onToggle}
                searchQuery={searchQuery}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for React.memo
  // Only re-render if relevant props changed
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.selectedItemId === nextProps.selectedItemId &&
    prevProps.searchQuery === nextProps.searchQuery &&
    prevProps.expandedIds.has(prevProps.item.id) === nextProps.expandedIds.has(nextProps.item.id) &&
    // Check if any children's expanded state changed
    (prevProps.item.children?.every(child =>
      prevProps.expandedIds.has(child.id) === nextProps.expandedIds.has(child.id)
    ) ?? true)
  )
})
