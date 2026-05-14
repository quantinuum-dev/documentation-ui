import { Cookie } from 'lucide-react'
import { ComponentProps } from 'react'

type CookieSettingsButtonProps = Omit<ComponentProps<'button'>, 'onClick'> & {
  onCookiesSettingsButtonClick: () => void
}

export function CookieSettingsButton({ onCookiesSettingsButtonClick, ...props }: CookieSettingsButtonProps) {
  return (
    <button
      {...props}
      onClick={onCookiesSettingsButtonClick}
      type="button"
      aria-label="Cookie settings button"
      aria-haspopup="dialog"
      className="group fixed left-2 bottom-2 z-modal h-8 max-w-8 hover:max-w-xs p-2 flex items-center overflow-hidden bg-muted rounded-full shadow-md cursor-pointer transition-all duration-300 ease-in-out"
    >
      <Cookie className="text-muted-foreground group-hover:text-foreground size-4 flex-shrink-0 ml-[1px]" />
      <div className="whitespace-nowrap transition-all duration-300 ease-in-out max-w-0 group-hover:max-w-xs group-hover:text-foreground text-xs font-medium px-2">
        Cookie Settings
      </div>
    </button>
  )
}
