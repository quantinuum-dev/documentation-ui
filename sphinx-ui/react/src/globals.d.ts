type Link = {
    href: string
    title: string
    openInNewTab: boolean
}
type ProductName = string
type Icon = {
    iconImageURL: string
}
declare const navTextLinks: Link[]
declare const navProductName: string
declare const navIconLinks: (Icon & Link)[]
declare const __NEXT_PUBLIC_GA_ID__: string | undefined
