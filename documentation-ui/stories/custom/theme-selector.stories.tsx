import { Meta, StoryObj } from "@storybook/react";
import { ThemeSelector } from "src/custom/theme-selector";
import { useTheme } from "src/custom/use-theme";
export function ThemeSelectorDemo() {
  const { theme, setMode } = useTheme();
  return <ThemeSelector  theme={theme} setMode={setMode} />;
}

const meta: Meta<typeof ThemeSelectorDemo> = {
  component: ThemeSelectorDemo,
};

export default meta;

export const Default: StoryObj<typeof ThemeSelectorDemo> = {
  args: {},
};
