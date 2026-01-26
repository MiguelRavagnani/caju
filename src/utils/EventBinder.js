export class EventBinder {
    constructor(target = window, context = null) {
        this.target = target;
        this.context = context;
        this.handlers = new Map();
    }

    bind(eventName, handler, options = {}) {
        const key = `${eventName}:${handler.name || 'handler'}`;
        const boundHandler = this.context ? handler.bind(this.context) : handler.bind(window);
        this.handlers.set(key, { boundHandler, options });
        this.target.addEventListener(eventName, boundHandler, options);
        return this;
    }

    bindMultiple(events, handler, options = {}) {
        events.forEach((eventName) => this.bind(eventName, handler, options));
        return this;
    }

    unbind(eventName, handlerName) {
        const key = `${eventName}:${handlerName}`;
        const { boundHandler, options } = this.handlers.get(key) || {};
        if (boundHandler) {
            this.target.removeEventListener(eventName, boundHandler, options);
            this.handlers.delete(key);
        }
        return this;
    }

    unbindAll() {
        this.handlers.forEach(({ boundHandler, options }, key) => {
            const [eventName] = key.split(':');
            this.target.removeEventListener(eventName, boundHandler, options);
        });
        this.handlers.clear();
        return this;
    }
}
