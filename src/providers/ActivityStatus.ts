import * as vscode from 'vscode';

const SPINNER_ASCII = ["←↖↑↗→↘↓↙", "▁▃▄▅▆▇█▇▆▅▄▃", "▉▊▋▌▍▎▏▎▍▌▋▊▉", "▖▘▝▗", "▌▀▐▄", "┤┘┴└├┌┬┐", "◢◣◤◥", "◰◳◲◱", "◴◷◶◵", "◐◓◑◒", "|/-\\"];

export class ActivityStatus {
    private statusBarItem: vscode.StatusBarItem;
    private activity: string;
    private spinner: string;
    private index = 0;

    constructor(activity: string, kind: number = 1) {
        this.spinner = SPINNER_ASCII[kind % SPINNER_ASCII.length];
        this.activity = activity;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.statusBarItem.text = this.activity;
        this.statusBarItem.show();
    }

    public refresh(): void {
        this.statusBarItem.text = `${this.activity}  ${this.spinner[this.index++ % this.spinner.length]}`;
        this.statusBarItem.show();
    }

    public done(): void {
        this.statusBarItem.text = `${this.activity}  DONE`;
        this.statusBarItem.show();
    }

    public failed(): void {
        this.statusBarItem.text = `${this.activity}  FAILED`;
        this.statusBarItem.show();
    }

    dispose(): void {
        this.statusBarItem.hide();
        this.statusBarItem.dispose();
    }
}