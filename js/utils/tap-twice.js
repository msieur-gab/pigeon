// Tap twice to confirm: the first tap arms the button ("Tap again to …"),
// the second within a few seconds does it. Otherwise it quietly resets.
// For actions that can't be undone, instead of a system dialog.

const ARM_MS = 3000;

export function tapTwice(btn, armedLabel, action) {
    if (btn.dataset.armed) {
        clearTimeout(Number(btn.dataset.armed));
        delete btn.dataset.armed;
        action();
        return;
    }
    const original = btn.textContent;
    btn.textContent = armedLabel;
    btn.classList.add('armed');
    btn.dataset.armed = String(setTimeout(() => {
        delete btn.dataset.armed;
        btn.textContent = original;
        btn.classList.remove('armed');
    }, ARM_MS));
}
