// Encyclopedia data types based on the JSON structure
export interface EncyclopediaMetadata {
  title: string
  version: string
  source: string
  totalParts: number
  totalSections: number
  totalSlides: number
}

export interface SlideChild {
  slideNum: number
  title: string
}

export interface Section {
  slideNum: number
  title: string
  childCount: number
  children: SlideChild[]
}

export interface Part {
  partNum: number
  sectionCount: number
  slideCount: number
  sections: Section[]
}

export interface EncyclopediaData {
  metadata: EncyclopediaMetadata
  parts: Record<string, Part>
}

// Tree item type for the sidebar
export type TreeItem = {
  id: string
  label: string
  slideNum?: number
  children?: TreeItem[]
  type: 'part' | 'section' | 'slide'
}

// Convert encyclopedia data to tree structure
export function convertToTreeData(data: EncyclopediaData): TreeItem[] {
  const parts = Object.entries(data.parts).sort(([a], [b]) => {
    const numA = parseInt(a.replace('part', ''))
    const numB = parseInt(b.replace('part', ''))
    return numA - numB
  })

  return parts.map(([partKey, part]) => ({
    id: partKey,
    label: `Part ${part.partNum}`,
    type: 'part' as const,
    children: part.sections.map((section, idx) => ({
      id: `${partKey}-section-${idx}`,
      label: section.title,
      slideNum: section.slideNum,
      type: 'section' as const,
      children: section.children.map((child, childIdx) => ({
        id: `${partKey}-section-${idx}-slide-${childIdx}`,
        label: child.title,
        slideNum: child.slideNum,
        type: 'slide' as const,
      })),
    })),
  }))
}
