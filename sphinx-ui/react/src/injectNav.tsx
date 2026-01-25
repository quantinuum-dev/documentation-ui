
import {createRoot} from "react-dom/client" 
import { DocsNavBar } from "@quantinuum/documentation-ui";
import { ComponentProps } from "react"; // do not remove

  (() => {
    const mountElement = document.querySelector('.nexus-nav')
    if (!mountElement) return
    const renderIn = document.createElement('div')
    mountElement.appendChild(renderIn)
  
    const root = createRoot(renderIn)

    root.render(
      <div className="use-tailwind">  <div className="antialiased" style={{fontFamily: `Inter, ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`}}><DocsNavBar activePath="/" ></DocsNavBar> </div></div>
    )
  })()
