/**
 * Example usage of ModalManager
 *
 * This file demonstrates how to use the modal system in Nodius.
 */
/*
import { modalManager } from "./ModalManager";
import { HtmlObject } from "../../utils/html/htmlType";

// Example 1: Simple HTML string modal
export function openSimpleModal() {
    const id = modalManager.open({
        id: "simple-modal",
        title: "Simple Modal",
        content: "<p>This is a simple modal with HTML content</p>",
        width: "400px",
        height: "300px",
        onClose: () => {
            console.log("Simple modal closed");
        }
    });

    return id;
}

// Example 2: HTMLElement modal
export function openElementModal() {
    const div = document.createElement("div");
    div.innerHTML = `
        <h2>Custom Element</h2>
        <p>This modal contains a custom HTMLElement</p>
        <button id="custom-btn">Click me</button>
    `;

    const button = div.querySelector("#custom-btn") as HTMLElement;
    button.onclick = () => alert("Button clicked!");

    const id = modalManager.open({
        id: "element-modal",
        title: "Element Modal",
        content: div,
        width: "500px",
        height: "350px"
    });

    return id;
}

// Example 3: HtmlObject modal with HtmlRender
export function openHtmlObjectModal() {
    const htmlObject: HtmlObject = {
        type: "div",
        css: [
            {
                selector: "&",
                content: `
                    padding: 20px;
                    background: var(--nodius-background-default);
                    border-radius: 8px;
                `
            },
            {
                selector: "& h2",
                content: `
                    color: var(--nodius-primary-main);
                    margin-bottom: 16px;
                `
            },
            {
                selector: "& button",
                content: `
                    padding: 8px 16px;
                    background: var(--nodius-primary-main);
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background 0.2s;
                `
            },
            {
                selector: "& button:hover",
                content: `
                    background: var(--nodius-primary-dark);
                `
            }
        ],
        childs: [
            {
                type: "h2",
                innerText: "HtmlObject Modal"
            },
            {
                type: "p",
                innerText: "This modal is rendered using HtmlRender with an HtmlObject definition."
            },
            {
                type: "button",
                innerText: "Action Button",
                events: [
                    {
                        type: "click",
                        action: () => {
                            console.log("Action button clicked!");
                        }
                    }
                ]
            }
        ]
    };

    const id = modalManager.open({
        id: "htmlobject-modal",
        title: "HtmlObject Modal",
        content: htmlObject,
        width: "600px",
        height: "400px",
        onClose: () => {
            console.log("HtmlObject modal closed");
        }
    });

    return id;
}

// Example 4: Auto-generated ID and close from outside
export async function openAutoIdModal() {
    const id = await modalManager.open({
        // No id specified, will generate one
        title: "Auto ID Modal",
        content: "<p>This modal has an auto-generated ID</p>",
        onClose: () => {
            console.log(`Modal with auto ID closed: ${id}`);
        }
    });

    // Close it after 5 seconds
    setTimeout(() => {
        modalManager.close(id);
    }, 5000);

    return id;
}

// Example 5: Toggle modal (close if exists, open if not)
export function toggleModal() {
    const modalId = "toggle-modal";

    if (modalManager.isOpen(modalId)) {
        modalManager.close(modalId);
    } else {
        modalManager.open({
            id: modalId,
            title: "Toggle Modal",
            content: "<p>Click the button again to close this modal</p>",
            closeIfExists: true // This is the default behavior
        });
    }
}

// Example 6: Update modal content dynamically
export function openDynamicModal() {
    let counter = 0;
    const modalId = "dynamic-modal";

    const updateContent = () => {
        counter++;
        modalManager.updateContent(
            modalId,
            `<div>
                <h3>Dynamic Content</h3>
                <p>Counter: ${counter}</p>
                <button id="update-btn">Update Content</button>
            </div>`
        );

        // Re-attach event listener after update
        setTimeout(() => {
            const btn = document.querySelector("#update-btn") as HTMLElement;
            if (btn) {
                btn.onclick = updateContent;
            }
        }, 0);
    };

    const id = modalManager.open({
        id: modalId,
        title: "Dynamic Modal",
        content: `<div>
            <h3>Dynamic Content</h3>
            <p>Counter: ${counter}</p>
            <button id="update-btn">Update Content</button>
        </div>`,
        width: "400px",
        height: "300px"
    });

    // Attach initial event listener
    setTimeout(() => {
        const btn = document.querySelector("#update-btn") as HTMLElement;
        if (btn) {
            btn.onclick = updateContent;
        }
    }, 0);

    return id;
}

// Example 7: Multiple modals with different z-index
export function openMultipleModals() {
    const ids: string[] = [];

    for (let i = 1; i <= 3; i++) {
        const id = modalManager.open({
            id: `modal-${i}`,
            title: `Modal ${i}`,
            content: `<p>This is modal number ${i}. Click on different modals to bring them to front.</p>`,
            width: "400px",
            height: "250px"
        });
        ids.push(id);
    }

    return ids;
}

// Example 8: Get list of open modals
export function listOpenModals() {
    const openModals = modalManager.getOpenModals();
    console.log("Open modals:", openModals);
    return openModals;
}

// Example 9: Close all modals
export function closeAllModals() {
    modalManager.closeAll();
}
*/