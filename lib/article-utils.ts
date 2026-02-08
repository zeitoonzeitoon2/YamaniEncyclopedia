export const normalizeSlugFromLink = (link: string): string => {
  try {
    let path = link || ''
    if (/^https?:\/\//i.test(link)) {
      const u = new URL(link)
      path = u.pathname
    }
    path = path.split('?')[0].split('#')[0]
    const after = path.replace(/^\/?articles\//, '')
    return decodeURIComponent(after.replace(/\/+$/g, ''))
  } catch {
    return (link || '').replace(/^\/?articles\//, '').replace(/\/+$/g, '')
  }
}
