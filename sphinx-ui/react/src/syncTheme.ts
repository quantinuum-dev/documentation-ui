import { getTheme, subscribeToTheme } from '../../../documentation-ui/src/utils'
(() =>  {
    document.body.setAttribute("data-theme",  getTheme().isDark ? "dark" : 'light') 
    subscribeToTheme(({isDark}) => {
        document.body.setAttribute("data-theme",  isDark ? "dark" : 'light') 
    })
})()
