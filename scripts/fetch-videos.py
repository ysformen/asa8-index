import os, json, urllib.request, urllib.parse

API_KEY    = os.environ['YT_API_KEY']
CHANNEL_ID = 'UC07a-1FKy4sJ4ZZTpp2RN5g'
API_BASE   = 'https://www.googleapis.com/youtube/v3'

def api_get(endpoint, params):
    params['key'] = API_KEY
    url = f"{API_BASE}/{endpoint}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url) as r:
        return json.load(r)

# 最新50件を検索
search = api_get('search', {
    'part': 'snippet',
    'channelId': CHANNEL_ID,
    'type': 'video',
    'maxResults': 50,
    'order': 'date',
})

ids = ','.join(item['id']['videoId'] for item in search.get('items', []))
if not ids:
    print('[]')
    raise SystemExit

# 詳細（概要欄・duration）を取得
detail = api_get('videos', {
    'part': 'snippet,contentDetails',
    'id': ids,
})

videos = []
for item in detail.get('items', []):
    s = item['snippet']
    videos.append({
        'id': item['id'],
        'snippet': {
            'title':       s['title'],
            'publishedAt': s['publishedAt'],
            'description': s['description'],
            'thumbnails':  s['thumbnails'],
        },
        'contentDetails': {'duration': item['contentDetails']['duration']},
    })

json.dump(videos, __import__('sys').stdout, ensure_ascii=False, indent=2)
