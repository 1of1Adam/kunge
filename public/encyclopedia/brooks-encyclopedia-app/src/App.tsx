import React, { useState, useEffect } from 'react'
import { EncyclopediaSidebar, getSavedState, findItemById } from '@/components/encyclopedia-sidebar'
import { SlideViewer } from '@/components/slide-viewer'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import type { EncyclopediaData, TreeItem } from '@/types/encyclopedia'
import { convertToTreeData } from '@/types/encyclopedia'

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

// Build breadcrumb path for an item using tree data for section lookup
function buildBreadcrumbs(item: TreeItem, treeData?: TreeItem[]): string[] {
  const crumbs = ['Home']

  // Extract part number from id
  const partMatch = item.id.match(/^(part(\d+))/)
  if (partMatch) {
    crumbs.push(`Part ${partMatch[2]}`)
  }

  if (item.type === 'part') {
    // Part only shows Part name
    return crumbs
  }

  if (item.type === 'section') {
    // Section shows Part > Section
    crumbs.push(toTitleCase(item.label))
    return crumbs
  }

  if (item.type === 'slide' && treeData) {
    // Slide shows Part > Section > Slide
    // Extract section index from id (e.g., "part16-section-45-slide-0" -> 45)
    const sectionMatch = item.id.match(/section-(\d+)/)
    if (sectionMatch && partMatch) {
      const partKey = partMatch[1]
      const sectionIdx = parseInt(sectionMatch[1])

      // Find the part in tree data
      const part = treeData.find(p => p.id === partKey)
      if (part?.children && part.children[sectionIdx]) {
        crumbs.push(toTitleCase(part.children[sectionIdx].label))
      }
    }
    crumbs.push(toTitleCase(item.label))
  }

  return crumbs
}

function App() {
  const [encyclopediaData, setEncyclopediaData] = useState<EncyclopediaData | null>(null)
  const [treeData, setTreeData] = useState<TreeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<TreeItem | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>(['Home'])

  // Load encyclopedia data and restore saved state
  useEffect(() => {
    fetch('/encyclopedia_complete.json')
      .then(res => res.json())
      .then(data => {
        setEncyclopediaData(data)
        const tree = convertToTreeData(data)
        setTreeData(tree)

        // Restore saved state from localStorage
        const savedState = getSavedState()
        if (savedState?.selectedItemId) {
          const savedItem = findItemById(tree, savedState.selectedItemId)
          if (savedItem) {
            setSelectedItem(savedItem)
            // Build breadcrumbs for restored item
            setBreadcrumbs(buildBreadcrumbs(savedItem, tree))
          }
        }

        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load encyclopedia data:', err)
        setLoading(false)
      })
  }, [])

  const handleItemSelect = (item: TreeItem) => {
    setSelectedItem(item)
    setBreadcrumbs(buildBreadcrumbs(item, treeData))
  }

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading encyclopedia...</p>
        </div>
      </div>
    )
  }

  if (!encyclopediaData) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-destructive">Loading Failed</p>
          <p className="text-muted-foreground">Unable to load encyclopedia data</p>
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <EncyclopediaSidebar
        data={encyclopediaData}
        onItemSelect={handleItemSelect}
        selectedItemId={selectedItem?.id}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 relative z-30">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={index}>
                  <BreadcrumbItem className={index === 0 ? '' : 'hidden md:block'}>
                    {index === breadcrumbs.length - 1 ? (
                      <BreadcrumbPage className="max-w-[200px] truncate">
                        {crumb}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href="#" className="max-w-[150px] truncate">
                        {crumb}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {index < breadcrumbs.length - 1 && (
                    <BreadcrumbSeparator className="hidden md:block" />
                  )}
                </React.Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col p-4 min-h-0">
          {selectedItem ? (
            <SelectedItemView item={selectedItem} />
          ) : (
            <WelcomeView metadata={encyclopediaData.metadata} />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

interface SelectedItemViewProps {
  item: TreeItem
}

function SelectedItemView({ item }: SelectedItemViewProps) {
  // If item has a slideNum, show the slide content
  if (item.slideNum) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex-1 min-h-0">
          <SlideViewer item={item} />
        </div>
      </div>
    )
  }

  // For parts without slideNum, show children list
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <h1 className="text-2xl font-bold tracking-tight">{item.label}</h1>
      </div>

      {item.children && item.children.length > 0 && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">
            Contents ({item.children.length})
          </h2>
          <div className="grid gap-2">
            {item.children.slice(0, 20).map((child) => (
              <div
                key={child.id}
                className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <span className="flex-1 text-sm">{child.label}</span>
              </div>
            ))}
            {item.children.length > 20 && (
              <div className="text-sm text-muted-foreground text-center py-2">
                {item.children.length - 20} more items...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface WelcomeViewProps {
  metadata: EncyclopediaData['metadata']
}

function WelcomeView({ metadata }: WelcomeViewProps) {
  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border p-8">
        <div className="flex items-center gap-3 mb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {metadata.title}
            </h1>
            <p className="text-muted-foreground">
              Version: {metadata.version}
            </p>
          </div>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          Welcome to The Brooks Encyclopedia of Chart Patterns. This is a comprehensive
          trading chart pattern reference that contains price action analysis for various
          market conditions. Use the left navigation bar to browse each section.
        </p>
      </div>

      {/* Statistics Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Parts"
          value={metadata.totalParts}
          description="Main categories"
        />
        <StatCard
          title="Total Sections"
          value={metadata.totalSections}
          description="Detailed topics"
        />
        <StatCard
          title="Total Slides"
          value={metadata.totalSlides.toLocaleString()}
          description="Chart examples"
        />
      </div>

      {/* Quick Start Guide */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">
          Quick Start
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <QuickStartItem
            step={1}
            title="Browse Contents"
            description="Use the left sidebar to browse 16 main parts"
          />
          <QuickStartItem
            step={2}
            title="Expand Sections"
            description="Click arrows to expand and view detailed section contents"
          />
          <QuickStartItem
            step={3}
            title="Search Function"
            description="Use the search box to quickly find specific chart patterns"
          />
          <QuickStartItem
            step={4}
            title="View Slides"
            description="Select specific slides to view chart pattern details"
          />
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  description: string
}

function StatCard({ title, value, description }: StatCardProps) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  )
}

interface QuickStartItemProps {
  step: number
  title: string
  description: string
}

function QuickStartItem({ step, title, description }: QuickStartItemProps) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
        {step}
      </div>
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export default App
