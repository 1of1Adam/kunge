#!/usr/bin/env python3
"""
生成完整的结构化数据（仅基于 slide_hierarchy，不依赖 CSV）
"""

import json
from pathlib import Path

ENCYCLOPEDIA_DIR = Path("/Users/adampeng/slide3_export/brooks_encyclopedia")

def load_all_hierarchies():
    """加载所有 Part 的 slide_hierarchy.json"""
    all_data = {}
    total_slides = 0
    total_groups = 0

    for part_num in range(1, 17):
        part_dir = ENCYCLOPEDIA_DIR / f"part{part_num:02d}"
        hierarchy_file = part_dir / "slide_hierarchy.json"

        if not hierarchy_file.exists():
            print(f"警告: {hierarchy_file} 不存在")
            continue

        with open(hierarchy_file, 'r', encoding='utf-8') as f:
            hierarchy = json.load(f)

        groups = []
        for group in hierarchy:
            child_count = len(group.get('children', []))
            groups.append({
                'slideNum': group['slideNum'],
                'title': group['title'],
                'childCount': child_count,
                'children': group.get('children', [])
            })
            total_slides += 1 + child_count  # 主 slide + 子 slides

        total_groups += len(groups)
        all_data[part_num] = groups

    return all_data, total_groups, total_slides

def generate_full_data():
    """生成完整结构化数据"""
    print("=" * 60)
    print("生成完整结构化数据（基于 Slide Hierarchy）")
    print("=" * 60)

    hierarchies, total_groups, total_slides = load_all_hierarchies()

    # 构建完整数据结构
    full_data = {
        'metadata': {
            'title': 'The Brooks Encyclopedia of Chart Patterns',
            'version': 'October 1, 2025',
            'source': 'Slide Hierarchy (Complete)',
            'totalParts': 16,
            'totalSections': total_groups,
            'totalSlides': total_slides
        },
        'parts': {}
    }

    for part_num in range(1, 17):
        part_id = f'part{part_num:02d}'
        groups = hierarchies.get(part_num, [])

        # 计算此 Part 的总 slide 数
        part_slides = sum(1 + g['childCount'] for g in groups)

        full_data['parts'][part_id] = {
            'partNum': part_num,
            'sectionCount': len(groups),
            'slideCount': part_slides,
            'sections': groups
        }

        print(f"  Part {part_num:>2}: {len(groups):>3} sections, {part_slides:>4} slides")

    # 保存结果
    output_path = ENCYCLOPEDIA_DIR / 'encyclopedia_complete.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(full_data, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 60}")
    print(f"📊 统计:")
    print(f"   Total Parts: {full_data['metadata']['totalParts']}")
    print(f"   Total Sections: {full_data['metadata']['totalSections']}")
    print(f"   Total Slides: {full_data['metadata']['totalSlides']}")
    print(f"\n✅ 输出文件: {output_path}")

    return full_data

if __name__ == "__main__":
    generate_full_data()
