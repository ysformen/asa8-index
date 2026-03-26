import sys, json
import xml.etree.ElementTree as ET

tree = ET.parse(sys.stdin)
root = tree.getroot()

ns = {
    'atom':  'http://www.w3.org/2005/Atom',
    'yt':    'http://www.youtube.com/xml/schemas/2015',
    'media': 'http://search.yahoo.com/mrss/',
}

videos = []
for entry in root.findall('atom:entry', ns):
    video_id  = entry.find('yt:videoId', ns).text
    title     = entry.find('atom:title', ns).text
    published = entry.find('atom:published', ns).text
    thumb_el  = entry.find('.//media:thumbnail', ns)
    thumb_url = thumb_el.get('url') if thumb_el is not None else f'https://i.ytimg.com/vi/{video_id}/mqdefault.jpg'
    desc_el   = entry.find('.//media:description', ns)
    desc      = desc_el.text if desc_el is not None else ''

    videos.append({
        'id': video_id,
        'snippet': {
            'title': title,
            'publishedAt': published,
            'description': desc,
            'thumbnails': {'medium': {'url': thumb_url}},
        },
        'contentDetails': {'duration': ''},
    })

json.dump(videos, sys.stdout, ensure_ascii=False, indent=2)
