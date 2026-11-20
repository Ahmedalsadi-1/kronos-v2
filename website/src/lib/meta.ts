export function setPageMeta(title: string, description: string) {
    document.title = title;
    const pageURL = new URL(window.location.pathname, "https://ahmedalsadi-1.github.io").href;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = pageURL;
    const ogURL = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (ogURL) ogURL.content = pageURL;

    const descriptionTag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (descriptionTag) {
        descriptionTag.content = description;
    }

    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitle) {
        ogTitle.content = title;
    }

    const ogDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    if (ogDescription) {
        ogDescription.content = description;
    }
}
