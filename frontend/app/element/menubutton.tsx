import clsx from "clsx";
import { memo, useState } from "react";
import { Button } from "./button";
import { FlyoutMenu } from "./flyoutmenu";
import "./menubutton.scss";

const MenuButtonComponent = ({ items, className, text, title }: MenuButtonProps) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className={clsx("menubutton", className)}>
            <FlyoutMenu items={items} onOpenChange={setIsOpen}>
                <Button
                    className="rounded-[3px] py-[2px] px-[2px]"
                    style={{ borderColor: isOpen ? "var(--accent-color)" : "transparent" }}
                    title={title}
                    variant="secondary"
                >
                    <div>{text}</div>
                    <i className="fa-sharp fa-solid fa-angle-down"></i>
                </Button>
            </FlyoutMenu>
        </div>
    );
};

export const MenuButton = memo(MenuButtonComponent) as typeof MenuButtonComponent;
