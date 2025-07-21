import { Moon, Sun, SunMoon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/ui/theme-provider";
import { Separator } from "@/components/ui/separator";
import { useAppContext } from "@/context/AppContext";

export function ModeToggle() {
  const { setTheme } = useTheme();
  const { setBrandColor, setBrandForeColor } = useAppContext();

  const changePrimaryPink = () => {
    setBrandColor("347 77% 50%");
    setBrandForeColor("0 0% 98%");
  };
  const changePrimaryWoow = () => {
    setBrandColor("46 82% 47.5%");
    setBrandForeColor("0 0% 0%");
  };
  const changePrimaryInsuranceServices = () => {
    setBrandColor("191.45 100% 29.8%");
    setBrandForeColor("0 0% 98%");
  };
  const changePrimaryCoral = () => {
    setBrandColor("16 100% 66%");
    setBrandForeColor("0 0% 98%");
  };
  const changePrimaryPurple = () => {
    setBrandColor("271 76% 53%");
    setBrandForeColor("0 0% 98%");
  };
  const changePrimaryDefault = () => {
    setBrandColor("");
    setBrandForeColor("");
  };
  const changePrimaryGreen = () => {
    setBrandColor("160 100% 19%");
    setBrandForeColor("0 0% 98%");
  };
  const changeYellowgreen = () => {
    setBrandColor("72 65% 63%");
    setBrandForeColor("0 0% 0%");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <div className="w-full flex flex-row items-center gap-2">
            <Sun className="w-5 h-5" /> Claro
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <div className="w-full flex flex-row items-center gap-2">
            <Moon className="w-5 h-4" /> Oscuro
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <div className="w-full flex flex-row items-center gap-2">
            <SunMoon className="w-5 h-5" /> Sistema
          </div>
        </DropdownMenuItem>
        <Separator className="my-1" />
        <DropdownMenuItem>
          <div className="w-full">
            <div className="w-full mt-1 flex flex-row gap-1 justify-between items-center">
              <div className="flex items-center justify-center">
                <button
                  className="bg-primary hover:bg-primary/70 w-5 h-5 rounded-full"
                  onClick={changePrimaryDefault}
                ></button>
              </div>
              <div className="flex items-center justify-center">
                <button
                  className="bg-[#e11d48] hover:bg-[#e11d48]/70 w-5 h-5 rounded-full"
                  onClick={changePrimaryPink}
                ></button>
              </div>
              <div className="flex items-center justify-center">
                <button
                  className="bg-[#e9ba24] hover:bg-[#e9ba24]/70 w-5 h-5 rounded-full"
                  onClick={changePrimaryWoow}
                ></button>
              </div>
              <div className="flex items-center justify-center">
                <button
                  className="bg-[#007b98] hover:bg-[#007b98]/70 w-5 h-5 rounded-full"
                  onClick={changePrimaryInsuranceServices}
                ></button>
              </div>
            </div>
            <div className="w-full mt-1 flex flex-row gap-1 justify-between items-center">
             
              <div className="flex items-center justify-center">
                <button
                  className="bg-[#FF7F50] hover:bg-[#FF7F50]/70 w-5 h-5 rounded-full"
                  onClick={changePrimaryCoral}
                ></button>
              </div>
              <div className="flex items-center justify-center">
                <button
                  className="bg-[#006241] hover:bg-[#006241]/70 w-5 h-5 rounded-full"
                  onClick={changePrimaryGreen}
                ></button>
              </div>
              <div className="flex items-center justify-center">
                <button
                  className="bg-[#8A2BE2] hover:bg-[#8A2BE2]/70 w-5 h-5 rounded-full"
                  onClick={changePrimaryPurple}
                ></button>
              </div>
               <div className="flex items-center justify-center">
                 <button
                  className="bg-[#c4de61] hover:bg-[#c4de61]/70 w-5 h-5 rounded-full"
                  onClick={changeYellowgreen}
                ></button>
              </div>
            </div>
            <div className="w-full mt-1 flex flex-row gap-1 justify-between items-center">
              <div className="flex items-center justify-center">
                {/* New color button */}
              </div>
            </div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
