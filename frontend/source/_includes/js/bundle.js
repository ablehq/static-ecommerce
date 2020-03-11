var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let stylesheet;
    let active = 0;
    let current_rules = {};
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        if (!current_rules[name]) {
            if (!stylesheet) {
                const style = element('style');
                document.head.appendChild(style);
                stylesheet = style.sheet;
            }
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        node.style.animation = (node.style.animation || '')
            .split(', ')
            .filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        )
            .join(', ');
        if (name && !--active)
            clear_rules();
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            let i = stylesheet.cssRules.length;
            while (i--)
                stylesheet.deleteRule(i);
            current_rules = {};
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function validate_each_keys(ctx, list, get_context, get_key) {
        const keys = new Set();
        for (let i = 0; i < list.length; i++) {
            const key = get_key(get_context(ctx, list, i));
            if (keys.has(key)) {
                throw new Error(`Cannot have duplicate keys in a keyed each`);
            }
            keys.add(key);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.19.1' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe,
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }
    function derived(stores, fn, initial_value) {
        const single = !Array.isArray(stores);
        const stores_array = single
            ? [stores]
            : stores;
        const auto = fn.length < 2;
        return readable(initial_value, (set) => {
            let inited = false;
            const values = [];
            let pending = 0;
            let cleanup = noop;
            const sync = () => {
                if (pending) {
                    return;
                }
                cleanup();
                const result = fn(single ? values[0] : values, set);
                if (auto) {
                    set(result);
                }
                else {
                    cleanup = is_function(result) ? result : noop;
                }
            };
            const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
                values[i] = value;
                pending &= ~(1 << i);
                if (inited) {
                    sync();
                }
            }, () => {
                pending |= (1 << i);
            }));
            inited = true;
            sync();
            return function stop() {
                run_all(unsubscribers);
                cleanup();
            };
        });
    }

    var bind = function bind(fn, thisArg) {
      return function wrap() {
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; i++) {
          args[i] = arguments[i];
        }
        return fn.apply(thisArg, args);
      };
    };

    /*global toString:true*/

    // utils is a library of generic helper functions non-specific to axios

    var toString = Object.prototype.toString;

    /**
     * Determine if a value is an Array
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is an Array, otherwise false
     */
    function isArray(val) {
      return toString.call(val) === '[object Array]';
    }

    /**
     * Determine if a value is undefined
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if the value is undefined, otherwise false
     */
    function isUndefined(val) {
      return typeof val === 'undefined';
    }

    /**
     * Determine if a value is a Buffer
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a Buffer, otherwise false
     */
    function isBuffer(val) {
      return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor)
        && typeof val.constructor.isBuffer === 'function' && val.constructor.isBuffer(val);
    }

    /**
     * Determine if a value is an ArrayBuffer
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is an ArrayBuffer, otherwise false
     */
    function isArrayBuffer(val) {
      return toString.call(val) === '[object ArrayBuffer]';
    }

    /**
     * Determine if a value is a FormData
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is an FormData, otherwise false
     */
    function isFormData(val) {
      return (typeof FormData !== 'undefined') && (val instanceof FormData);
    }

    /**
     * Determine if a value is a view on an ArrayBuffer
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
     */
    function isArrayBufferView(val) {
      var result;
      if ((typeof ArrayBuffer !== 'undefined') && (ArrayBuffer.isView)) {
        result = ArrayBuffer.isView(val);
      } else {
        result = (val) && (val.buffer) && (val.buffer instanceof ArrayBuffer);
      }
      return result;
    }

    /**
     * Determine if a value is a String
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a String, otherwise false
     */
    function isString(val) {
      return typeof val === 'string';
    }

    /**
     * Determine if a value is a Number
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a Number, otherwise false
     */
    function isNumber(val) {
      return typeof val === 'number';
    }

    /**
     * Determine if a value is an Object
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is an Object, otherwise false
     */
    function isObject(val) {
      return val !== null && typeof val === 'object';
    }

    /**
     * Determine if a value is a Date
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a Date, otherwise false
     */
    function isDate(val) {
      return toString.call(val) === '[object Date]';
    }

    /**
     * Determine if a value is a File
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a File, otherwise false
     */
    function isFile(val) {
      return toString.call(val) === '[object File]';
    }

    /**
     * Determine if a value is a Blob
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a Blob, otherwise false
     */
    function isBlob(val) {
      return toString.call(val) === '[object Blob]';
    }

    /**
     * Determine if a value is a Function
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a Function, otherwise false
     */
    function isFunction(val) {
      return toString.call(val) === '[object Function]';
    }

    /**
     * Determine if a value is a Stream
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a Stream, otherwise false
     */
    function isStream(val) {
      return isObject(val) && isFunction(val.pipe);
    }

    /**
     * Determine if a value is a URLSearchParams object
     *
     * @param {Object} val The value to test
     * @returns {boolean} True if value is a URLSearchParams object, otherwise false
     */
    function isURLSearchParams(val) {
      return typeof URLSearchParams !== 'undefined' && val instanceof URLSearchParams;
    }

    /**
     * Trim excess whitespace off the beginning and end of a string
     *
     * @param {String} str The String to trim
     * @returns {String} The String freed of excess whitespace
     */
    function trim(str) {
      return str.replace(/^\s*/, '').replace(/\s*$/, '');
    }

    /**
     * Determine if we're running in a standard browser environment
     *
     * This allows axios to run in a web worker, and react-native.
     * Both environments support XMLHttpRequest, but not fully standard globals.
     *
     * web workers:
     *  typeof window -> undefined
     *  typeof document -> undefined
     *
     * react-native:
     *  navigator.product -> 'ReactNative'
     * nativescript
     *  navigator.product -> 'NativeScript' or 'NS'
     */
    function isStandardBrowserEnv() {
      if (typeof navigator !== 'undefined' && (navigator.product === 'ReactNative' ||
                                               navigator.product === 'NativeScript' ||
                                               navigator.product === 'NS')) {
        return false;
      }
      return (
        typeof window !== 'undefined' &&
        typeof document !== 'undefined'
      );
    }

    /**
     * Iterate over an Array or an Object invoking a function for each item.
     *
     * If `obj` is an Array callback will be called passing
     * the value, index, and complete array for each item.
     *
     * If 'obj' is an Object callback will be called passing
     * the value, key, and complete object for each property.
     *
     * @param {Object|Array} obj The object to iterate
     * @param {Function} fn The callback to invoke for each item
     */
    function forEach(obj, fn) {
      // Don't bother if no value provided
      if (obj === null || typeof obj === 'undefined') {
        return;
      }

      // Force an array if not already something iterable
      if (typeof obj !== 'object') {
        /*eslint no-param-reassign:0*/
        obj = [obj];
      }

      if (isArray(obj)) {
        // Iterate over array values
        for (var i = 0, l = obj.length; i < l; i++) {
          fn.call(null, obj[i], i, obj);
        }
      } else {
        // Iterate over object keys
        for (var key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            fn.call(null, obj[key], key, obj);
          }
        }
      }
    }

    /**
     * Accepts varargs expecting each argument to be an object, then
     * immutably merges the properties of each object and returns result.
     *
     * When multiple objects contain the same key the later object in
     * the arguments list will take precedence.
     *
     * Example:
     *
     * ```js
     * var result = merge({foo: 123}, {foo: 456});
     * console.log(result.foo); // outputs 456
     * ```
     *
     * @param {Object} obj1 Object to merge
     * @returns {Object} Result of all merge properties
     */
    function merge(/* obj1, obj2, obj3, ... */) {
      var result = {};
      function assignValue(val, key) {
        if (typeof result[key] === 'object' && typeof val === 'object') {
          result[key] = merge(result[key], val);
        } else {
          result[key] = val;
        }
      }

      for (var i = 0, l = arguments.length; i < l; i++) {
        forEach(arguments[i], assignValue);
      }
      return result;
    }

    /**
     * Function equal to merge with the difference being that no reference
     * to original objects is kept.
     *
     * @see merge
     * @param {Object} obj1 Object to merge
     * @returns {Object} Result of all merge properties
     */
    function deepMerge(/* obj1, obj2, obj3, ... */) {
      var result = {};
      function assignValue(val, key) {
        if (typeof result[key] === 'object' && typeof val === 'object') {
          result[key] = deepMerge(result[key], val);
        } else if (typeof val === 'object') {
          result[key] = deepMerge({}, val);
        } else {
          result[key] = val;
        }
      }

      for (var i = 0, l = arguments.length; i < l; i++) {
        forEach(arguments[i], assignValue);
      }
      return result;
    }

    /**
     * Extends object a by mutably adding to it the properties of object b.
     *
     * @param {Object} a The object to be extended
     * @param {Object} b The object to copy properties from
     * @param {Object} thisArg The object to bind function to
     * @return {Object} The resulting value of object a
     */
    function extend(a, b, thisArg) {
      forEach(b, function assignValue(val, key) {
        if (thisArg && typeof val === 'function') {
          a[key] = bind(val, thisArg);
        } else {
          a[key] = val;
        }
      });
      return a;
    }

    var utils = {
      isArray: isArray,
      isArrayBuffer: isArrayBuffer,
      isBuffer: isBuffer,
      isFormData: isFormData,
      isArrayBufferView: isArrayBufferView,
      isString: isString,
      isNumber: isNumber,
      isObject: isObject,
      isUndefined: isUndefined,
      isDate: isDate,
      isFile: isFile,
      isBlob: isBlob,
      isFunction: isFunction,
      isStream: isStream,
      isURLSearchParams: isURLSearchParams,
      isStandardBrowserEnv: isStandardBrowserEnv,
      forEach: forEach,
      merge: merge,
      deepMerge: deepMerge,
      extend: extend,
      trim: trim
    };

    function encode(val) {
      return encodeURIComponent(val).
        replace(/%40/gi, '@').
        replace(/%3A/gi, ':').
        replace(/%24/g, '$').
        replace(/%2C/gi, ',').
        replace(/%20/g, '+').
        replace(/%5B/gi, '[').
        replace(/%5D/gi, ']');
    }

    /**
     * Build a URL by appending params to the end
     *
     * @param {string} url The base of the url (e.g., http://www.google.com)
     * @param {object} [params] The params to be appended
     * @returns {string} The formatted url
     */
    var buildURL = function buildURL(url, params, paramsSerializer) {
      /*eslint no-param-reassign:0*/
      if (!params) {
        return url;
      }

      var serializedParams;
      if (paramsSerializer) {
        serializedParams = paramsSerializer(params);
      } else if (utils.isURLSearchParams(params)) {
        serializedParams = params.toString();
      } else {
        var parts = [];

        utils.forEach(params, function serialize(val, key) {
          if (val === null || typeof val === 'undefined') {
            return;
          }

          if (utils.isArray(val)) {
            key = key + '[]';
          } else {
            val = [val];
          }

          utils.forEach(val, function parseValue(v) {
            if (utils.isDate(v)) {
              v = v.toISOString();
            } else if (utils.isObject(v)) {
              v = JSON.stringify(v);
            }
            parts.push(encode(key) + '=' + encode(v));
          });
        });

        serializedParams = parts.join('&');
      }

      if (serializedParams) {
        var hashmarkIndex = url.indexOf('#');
        if (hashmarkIndex !== -1) {
          url = url.slice(0, hashmarkIndex);
        }

        url += (url.indexOf('?') === -1 ? '?' : '&') + serializedParams;
      }

      return url;
    };

    function InterceptorManager() {
      this.handlers = [];
    }

    /**
     * Add a new interceptor to the stack
     *
     * @param {Function} fulfilled The function to handle `then` for a `Promise`
     * @param {Function} rejected The function to handle `reject` for a `Promise`
     *
     * @return {Number} An ID used to remove interceptor later
     */
    InterceptorManager.prototype.use = function use(fulfilled, rejected) {
      this.handlers.push({
        fulfilled: fulfilled,
        rejected: rejected
      });
      return this.handlers.length - 1;
    };

    /**
     * Remove an interceptor from the stack
     *
     * @param {Number} id The ID that was returned by `use`
     */
    InterceptorManager.prototype.eject = function eject(id) {
      if (this.handlers[id]) {
        this.handlers[id] = null;
      }
    };

    /**
     * Iterate over all the registered interceptors
     *
     * This method is particularly useful for skipping over any
     * interceptors that may have become `null` calling `eject`.
     *
     * @param {Function} fn The function to call for each interceptor
     */
    InterceptorManager.prototype.forEach = function forEach(fn) {
      utils.forEach(this.handlers, function forEachHandler(h) {
        if (h !== null) {
          fn(h);
        }
      });
    };

    var InterceptorManager_1 = InterceptorManager;

    /**
     * Transform the data for a request or a response
     *
     * @param {Object|String} data The data to be transformed
     * @param {Array} headers The headers for the request or response
     * @param {Array|Function} fns A single function or Array of functions
     * @returns {*} The resulting transformed data
     */
    var transformData = function transformData(data, headers, fns) {
      /*eslint no-param-reassign:0*/
      utils.forEach(fns, function transform(fn) {
        data = fn(data, headers);
      });

      return data;
    };

    var isCancel = function isCancel(value) {
      return !!(value && value.__CANCEL__);
    };

    var normalizeHeaderName = function normalizeHeaderName(headers, normalizedName) {
      utils.forEach(headers, function processHeader(value, name) {
        if (name !== normalizedName && name.toUpperCase() === normalizedName.toUpperCase()) {
          headers[normalizedName] = value;
          delete headers[name];
        }
      });
    };

    /**
     * Update an Error with the specified config, error code, and response.
     *
     * @param {Error} error The error to update.
     * @param {Object} config The config.
     * @param {string} [code] The error code (for example, 'ECONNABORTED').
     * @param {Object} [request] The request.
     * @param {Object} [response] The response.
     * @returns {Error} The error.
     */
    var enhanceError = function enhanceError(error, config, code, request, response) {
      error.config = config;
      if (code) {
        error.code = code;
      }

      error.request = request;
      error.response = response;
      error.isAxiosError = true;

      error.toJSON = function() {
        return {
          // Standard
          message: this.message,
          name: this.name,
          // Microsoft
          description: this.description,
          number: this.number,
          // Mozilla
          fileName: this.fileName,
          lineNumber: this.lineNumber,
          columnNumber: this.columnNumber,
          stack: this.stack,
          // Axios
          config: this.config,
          code: this.code
        };
      };
      return error;
    };

    /**
     * Create an Error with the specified message, config, error code, request and response.
     *
     * @param {string} message The error message.
     * @param {Object} config The config.
     * @param {string} [code] The error code (for example, 'ECONNABORTED').
     * @param {Object} [request] The request.
     * @param {Object} [response] The response.
     * @returns {Error} The created error.
     */
    var createError = function createError(message, config, code, request, response) {
      var error = new Error(message);
      return enhanceError(error, config, code, request, response);
    };

    /**
     * Resolve or reject a Promise based on response status.
     *
     * @param {Function} resolve A function that resolves the promise.
     * @param {Function} reject A function that rejects the promise.
     * @param {object} response The response.
     */
    var settle = function settle(resolve, reject, response) {
      var validateStatus = response.config.validateStatus;
      if (!validateStatus || validateStatus(response.status)) {
        resolve(response);
      } else {
        reject(createError(
          'Request failed with status code ' + response.status,
          response.config,
          null,
          response.request,
          response
        ));
      }
    };

    /**
     * Determines whether the specified URL is absolute
     *
     * @param {string} url The URL to test
     * @returns {boolean} True if the specified URL is absolute, otherwise false
     */
    var isAbsoluteURL = function isAbsoluteURL(url) {
      // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
      // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
      // by any combination of letters, digits, plus, period, or hyphen.
      return /^([a-z][a-z\d\+\-\.]*:)?\/\//i.test(url);
    };

    /**
     * Creates a new URL by combining the specified URLs
     *
     * @param {string} baseURL The base URL
     * @param {string} relativeURL The relative URL
     * @returns {string} The combined URL
     */
    var combineURLs = function combineURLs(baseURL, relativeURL) {
      return relativeURL
        ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
        : baseURL;
    };

    /**
     * Creates a new URL by combining the baseURL with the requestedURL,
     * only when the requestedURL is not already an absolute URL.
     * If the requestURL is absolute, this function returns the requestedURL untouched.
     *
     * @param {string} baseURL The base URL
     * @param {string} requestedURL Absolute or relative URL to combine
     * @returns {string} The combined full path
     */
    var buildFullPath = function buildFullPath(baseURL, requestedURL) {
      if (baseURL && !isAbsoluteURL(requestedURL)) {
        return combineURLs(baseURL, requestedURL);
      }
      return requestedURL;
    };

    // Headers whose duplicates are ignored by node
    // c.f. https://nodejs.org/api/http.html#http_message_headers
    var ignoreDuplicateOf = [
      'age', 'authorization', 'content-length', 'content-type', 'etag',
      'expires', 'from', 'host', 'if-modified-since', 'if-unmodified-since',
      'last-modified', 'location', 'max-forwards', 'proxy-authorization',
      'referer', 'retry-after', 'user-agent'
    ];

    /**
     * Parse headers into an object
     *
     * ```
     * Date: Wed, 27 Aug 2014 08:58:49 GMT
     * Content-Type: application/json
     * Connection: keep-alive
     * Transfer-Encoding: chunked
     * ```
     *
     * @param {String} headers Headers needing to be parsed
     * @returns {Object} Headers parsed into an object
     */
    var parseHeaders = function parseHeaders(headers) {
      var parsed = {};
      var key;
      var val;
      var i;

      if (!headers) { return parsed; }

      utils.forEach(headers.split('\n'), function parser(line) {
        i = line.indexOf(':');
        key = utils.trim(line.substr(0, i)).toLowerCase();
        val = utils.trim(line.substr(i + 1));

        if (key) {
          if (parsed[key] && ignoreDuplicateOf.indexOf(key) >= 0) {
            return;
          }
          if (key === 'set-cookie') {
            parsed[key] = (parsed[key] ? parsed[key] : []).concat([val]);
          } else {
            parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
          }
        }
      });

      return parsed;
    };

    var isURLSameOrigin = (
      utils.isStandardBrowserEnv() ?

      // Standard browser envs have full support of the APIs needed to test
      // whether the request URL is of the same origin as current location.
        (function standardBrowserEnv() {
          var msie = /(msie|trident)/i.test(navigator.userAgent);
          var urlParsingNode = document.createElement('a');
          var originURL;

          /**
        * Parse a URL to discover it's components
        *
        * @param {String} url The URL to be parsed
        * @returns {Object}
        */
          function resolveURL(url) {
            var href = url;

            if (msie) {
            // IE needs attribute set twice to normalize properties
              urlParsingNode.setAttribute('href', href);
              href = urlParsingNode.href;
            }

            urlParsingNode.setAttribute('href', href);

            // urlParsingNode provides the UrlUtils interface - http://url.spec.whatwg.org/#urlutils
            return {
              href: urlParsingNode.href,
              protocol: urlParsingNode.protocol ? urlParsingNode.protocol.replace(/:$/, '') : '',
              host: urlParsingNode.host,
              search: urlParsingNode.search ? urlParsingNode.search.replace(/^\?/, '') : '',
              hash: urlParsingNode.hash ? urlParsingNode.hash.replace(/^#/, '') : '',
              hostname: urlParsingNode.hostname,
              port: urlParsingNode.port,
              pathname: (urlParsingNode.pathname.charAt(0) === '/') ?
                urlParsingNode.pathname :
                '/' + urlParsingNode.pathname
            };
          }

          originURL = resolveURL(window.location.href);

          /**
        * Determine if a URL shares the same origin as the current location
        *
        * @param {String} requestURL The URL to test
        * @returns {boolean} True if URL shares the same origin, otherwise false
        */
          return function isURLSameOrigin(requestURL) {
            var parsed = (utils.isString(requestURL)) ? resolveURL(requestURL) : requestURL;
            return (parsed.protocol === originURL.protocol &&
                parsed.host === originURL.host);
          };
        })() :

      // Non standard browser envs (web workers, react-native) lack needed support.
        (function nonStandardBrowserEnv() {
          return function isURLSameOrigin() {
            return true;
          };
        })()
    );

    var cookies = (
      utils.isStandardBrowserEnv() ?

      // Standard browser envs support document.cookie
        (function standardBrowserEnv() {
          return {
            write: function write(name, value, expires, path, domain, secure) {
              var cookie = [];
              cookie.push(name + '=' + encodeURIComponent(value));

              if (utils.isNumber(expires)) {
                cookie.push('expires=' + new Date(expires).toGMTString());
              }

              if (utils.isString(path)) {
                cookie.push('path=' + path);
              }

              if (utils.isString(domain)) {
                cookie.push('domain=' + domain);
              }

              if (secure === true) {
                cookie.push('secure');
              }

              document.cookie = cookie.join('; ');
            },

            read: function read(name) {
              var match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
              return (match ? decodeURIComponent(match[3]) : null);
            },

            remove: function remove(name) {
              this.write(name, '', Date.now() - 86400000);
            }
          };
        })() :

      // Non standard browser env (web workers, react-native) lack needed support.
        (function nonStandardBrowserEnv() {
          return {
            write: function write() {},
            read: function read() { return null; },
            remove: function remove() {}
          };
        })()
    );

    var xhr = function xhrAdapter(config) {
      return new Promise(function dispatchXhrRequest(resolve, reject) {
        var requestData = config.data;
        var requestHeaders = config.headers;

        if (utils.isFormData(requestData)) {
          delete requestHeaders['Content-Type']; // Let the browser set it
        }

        var request = new XMLHttpRequest();

        // HTTP basic authentication
        if (config.auth) {
          var username = config.auth.username || '';
          var password = config.auth.password || '';
          requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
        }

        var fullPath = buildFullPath(config.baseURL, config.url);
        request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

        // Set the request timeout in MS
        request.timeout = config.timeout;

        // Listen for ready state
        request.onreadystatechange = function handleLoad() {
          if (!request || request.readyState !== 4) {
            return;
          }

          // The request errored out and we didn't get a response, this will be
          // handled by onerror instead
          // With one exception: request that using file: protocol, most browsers
          // will return status as 0 even though it's a successful request
          if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
            return;
          }

          // Prepare the response
          var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
          var responseData = !config.responseType || config.responseType === 'text' ? request.responseText : request.response;
          var response = {
            data: responseData,
            status: request.status,
            statusText: request.statusText,
            headers: responseHeaders,
            config: config,
            request: request
          };

          settle(resolve, reject, response);

          // Clean up request
          request = null;
        };

        // Handle browser request cancellation (as opposed to a manual cancellation)
        request.onabort = function handleAbort() {
          if (!request) {
            return;
          }

          reject(createError('Request aborted', config, 'ECONNABORTED', request));

          // Clean up request
          request = null;
        };

        // Handle low level network errors
        request.onerror = function handleError() {
          // Real errors are hidden from us by the browser
          // onerror should only fire if it's a network error
          reject(createError('Network Error', config, null, request));

          // Clean up request
          request = null;
        };

        // Handle timeout
        request.ontimeout = function handleTimeout() {
          var timeoutErrorMessage = 'timeout of ' + config.timeout + 'ms exceeded';
          if (config.timeoutErrorMessage) {
            timeoutErrorMessage = config.timeoutErrorMessage;
          }
          reject(createError(timeoutErrorMessage, config, 'ECONNABORTED',
            request));

          // Clean up request
          request = null;
        };

        // Add xsrf header
        // This is only done if running in a standard browser environment.
        // Specifically not if we're in a web worker, or react-native.
        if (utils.isStandardBrowserEnv()) {
          var cookies$1 = cookies;

          // Add xsrf header
          var xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath)) && config.xsrfCookieName ?
            cookies$1.read(config.xsrfCookieName) :
            undefined;

          if (xsrfValue) {
            requestHeaders[config.xsrfHeaderName] = xsrfValue;
          }
        }

        // Add headers to the request
        if ('setRequestHeader' in request) {
          utils.forEach(requestHeaders, function setRequestHeader(val, key) {
            if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
              // Remove Content-Type if data is undefined
              delete requestHeaders[key];
            } else {
              // Otherwise add header to the request
              request.setRequestHeader(key, val);
            }
          });
        }

        // Add withCredentials to request if needed
        if (!utils.isUndefined(config.withCredentials)) {
          request.withCredentials = !!config.withCredentials;
        }

        // Add responseType to request if needed
        if (config.responseType) {
          try {
            request.responseType = config.responseType;
          } catch (e) {
            // Expected DOMException thrown by browsers not compatible XMLHttpRequest Level 2.
            // But, this can be suppressed for 'json' type as it can be parsed by default 'transformResponse' function.
            if (config.responseType !== 'json') {
              throw e;
            }
          }
        }

        // Handle progress if needed
        if (typeof config.onDownloadProgress === 'function') {
          request.addEventListener('progress', config.onDownloadProgress);
        }

        // Not all browsers support upload events
        if (typeof config.onUploadProgress === 'function' && request.upload) {
          request.upload.addEventListener('progress', config.onUploadProgress);
        }

        if (config.cancelToken) {
          // Handle cancellation
          config.cancelToken.promise.then(function onCanceled(cancel) {
            if (!request) {
              return;
            }

            request.abort();
            reject(cancel);
            // Clean up request
            request = null;
          });
        }

        if (requestData === undefined) {
          requestData = null;
        }

        // Send the request
        request.send(requestData);
      });
    };

    var DEFAULT_CONTENT_TYPE = {
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    function setContentTypeIfUnset(headers, value) {
      if (!utils.isUndefined(headers) && utils.isUndefined(headers['Content-Type'])) {
        headers['Content-Type'] = value;
      }
    }

    function getDefaultAdapter() {
      var adapter;
      if (typeof XMLHttpRequest !== 'undefined') {
        // For browsers use XHR adapter
        adapter = xhr;
      } else if (typeof process !== 'undefined' && Object.prototype.toString.call(process) === '[object process]') {
        // For node use HTTP adapter
        adapter = xhr;
      }
      return adapter;
    }

    var defaults = {
      adapter: getDefaultAdapter(),

      transformRequest: [function transformRequest(data, headers) {
        normalizeHeaderName(headers, 'Accept');
        normalizeHeaderName(headers, 'Content-Type');
        if (utils.isFormData(data) ||
          utils.isArrayBuffer(data) ||
          utils.isBuffer(data) ||
          utils.isStream(data) ||
          utils.isFile(data) ||
          utils.isBlob(data)
        ) {
          return data;
        }
        if (utils.isArrayBufferView(data)) {
          return data.buffer;
        }
        if (utils.isURLSearchParams(data)) {
          setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
          return data.toString();
        }
        if (utils.isObject(data)) {
          setContentTypeIfUnset(headers, 'application/json;charset=utf-8');
          return JSON.stringify(data);
        }
        return data;
      }],

      transformResponse: [function transformResponse(data) {
        /*eslint no-param-reassign:0*/
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (e) { /* Ignore */ }
        }
        return data;
      }],

      /**
       * A timeout in milliseconds to abort a request. If set to 0 (default) a
       * timeout is not created.
       */
      timeout: 0,

      xsrfCookieName: 'XSRF-TOKEN',
      xsrfHeaderName: 'X-XSRF-TOKEN',

      maxContentLength: -1,

      validateStatus: function validateStatus(status) {
        return status >= 200 && status < 300;
      }
    };

    defaults.headers = {
      common: {
        'Accept': 'application/json, text/plain, */*'
      }
    };

    utils.forEach(['delete', 'get', 'head'], function forEachMethodNoData(method) {
      defaults.headers[method] = {};
    });

    utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
      defaults.headers[method] = utils.merge(DEFAULT_CONTENT_TYPE);
    });

    var defaults_1 = defaults;

    /**
     * Throws a `Cancel` if cancellation has been requested.
     */
    function throwIfCancellationRequested(config) {
      if (config.cancelToken) {
        config.cancelToken.throwIfRequested();
      }
    }

    /**
     * Dispatch a request to the server using the configured adapter.
     *
     * @param {object} config The config that is to be used for the request
     * @returns {Promise} The Promise to be fulfilled
     */
    var dispatchRequest = function dispatchRequest(config) {
      throwIfCancellationRequested(config);

      // Ensure headers exist
      config.headers = config.headers || {};

      // Transform request data
      config.data = transformData(
        config.data,
        config.headers,
        config.transformRequest
      );

      // Flatten headers
      config.headers = utils.merge(
        config.headers.common || {},
        config.headers[config.method] || {},
        config.headers
      );

      utils.forEach(
        ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
        function cleanHeaderConfig(method) {
          delete config.headers[method];
        }
      );

      var adapter = config.adapter || defaults_1.adapter;

      return adapter(config).then(function onAdapterResolution(response) {
        throwIfCancellationRequested(config);

        // Transform response data
        response.data = transformData(
          response.data,
          response.headers,
          config.transformResponse
        );

        return response;
      }, function onAdapterRejection(reason) {
        if (!isCancel(reason)) {
          throwIfCancellationRequested(config);

          // Transform response data
          if (reason && reason.response) {
            reason.response.data = transformData(
              reason.response.data,
              reason.response.headers,
              config.transformResponse
            );
          }
        }

        return Promise.reject(reason);
      });
    };

    /**
     * Config-specific merge-function which creates a new config-object
     * by merging two configuration objects together.
     *
     * @param {Object} config1
     * @param {Object} config2
     * @returns {Object} New object resulting from merging config2 to config1
     */
    var mergeConfig = function mergeConfig(config1, config2) {
      // eslint-disable-next-line no-param-reassign
      config2 = config2 || {};
      var config = {};

      var valueFromConfig2Keys = ['url', 'method', 'params', 'data'];
      var mergeDeepPropertiesKeys = ['headers', 'auth', 'proxy'];
      var defaultToConfig2Keys = [
        'baseURL', 'url', 'transformRequest', 'transformResponse', 'paramsSerializer',
        'timeout', 'withCredentials', 'adapter', 'responseType', 'xsrfCookieName',
        'xsrfHeaderName', 'onUploadProgress', 'onDownloadProgress',
        'maxContentLength', 'validateStatus', 'maxRedirects', 'httpAgent',
        'httpsAgent', 'cancelToken', 'socketPath'
      ];

      utils.forEach(valueFromConfig2Keys, function valueFromConfig2(prop) {
        if (typeof config2[prop] !== 'undefined') {
          config[prop] = config2[prop];
        }
      });

      utils.forEach(mergeDeepPropertiesKeys, function mergeDeepProperties(prop) {
        if (utils.isObject(config2[prop])) {
          config[prop] = utils.deepMerge(config1[prop], config2[prop]);
        } else if (typeof config2[prop] !== 'undefined') {
          config[prop] = config2[prop];
        } else if (utils.isObject(config1[prop])) {
          config[prop] = utils.deepMerge(config1[prop]);
        } else if (typeof config1[prop] !== 'undefined') {
          config[prop] = config1[prop];
        }
      });

      utils.forEach(defaultToConfig2Keys, function defaultToConfig2(prop) {
        if (typeof config2[prop] !== 'undefined') {
          config[prop] = config2[prop];
        } else if (typeof config1[prop] !== 'undefined') {
          config[prop] = config1[prop];
        }
      });

      var axiosKeys = valueFromConfig2Keys
        .concat(mergeDeepPropertiesKeys)
        .concat(defaultToConfig2Keys);

      var otherKeys = Object
        .keys(config2)
        .filter(function filterAxiosKeys(key) {
          return axiosKeys.indexOf(key) === -1;
        });

      utils.forEach(otherKeys, function otherKeysDefaultToConfig2(prop) {
        if (typeof config2[prop] !== 'undefined') {
          config[prop] = config2[prop];
        } else if (typeof config1[prop] !== 'undefined') {
          config[prop] = config1[prop];
        }
      });

      return config;
    };

    /**
     * Create a new instance of Axios
     *
     * @param {Object} instanceConfig The default config for the instance
     */
    function Axios(instanceConfig) {
      this.defaults = instanceConfig;
      this.interceptors = {
        request: new InterceptorManager_1(),
        response: new InterceptorManager_1()
      };
    }

    /**
     * Dispatch a request
     *
     * @param {Object} config The config specific for this request (merged with this.defaults)
     */
    Axios.prototype.request = function request(config) {
      /*eslint no-param-reassign:0*/
      // Allow for axios('example/url'[, config]) a la fetch API
      if (typeof config === 'string') {
        config = arguments[1] || {};
        config.url = arguments[0];
      } else {
        config = config || {};
      }

      config = mergeConfig(this.defaults, config);

      // Set config.method
      if (config.method) {
        config.method = config.method.toLowerCase();
      } else if (this.defaults.method) {
        config.method = this.defaults.method.toLowerCase();
      } else {
        config.method = 'get';
      }

      // Hook up interceptors middleware
      var chain = [dispatchRequest, undefined];
      var promise = Promise.resolve(config);

      this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
        chain.unshift(interceptor.fulfilled, interceptor.rejected);
      });

      this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
        chain.push(interceptor.fulfilled, interceptor.rejected);
      });

      while (chain.length) {
        promise = promise.then(chain.shift(), chain.shift());
      }

      return promise;
    };

    Axios.prototype.getUri = function getUri(config) {
      config = mergeConfig(this.defaults, config);
      return buildURL(config.url, config.params, config.paramsSerializer).replace(/^\?/, '');
    };

    // Provide aliases for supported request methods
    utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
      /*eslint func-names:0*/
      Axios.prototype[method] = function(url, config) {
        return this.request(utils.merge(config || {}, {
          method: method,
          url: url
        }));
      };
    });

    utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
      /*eslint func-names:0*/
      Axios.prototype[method] = function(url, data, config) {
        return this.request(utils.merge(config || {}, {
          method: method,
          url: url,
          data: data
        }));
      };
    });

    var Axios_1 = Axios;

    /**
     * A `Cancel` is an object that is thrown when an operation is canceled.
     *
     * @class
     * @param {string=} message The message.
     */
    function Cancel(message) {
      this.message = message;
    }

    Cancel.prototype.toString = function toString() {
      return 'Cancel' + (this.message ? ': ' + this.message : '');
    };

    Cancel.prototype.__CANCEL__ = true;

    var Cancel_1 = Cancel;

    /**
     * A `CancelToken` is an object that can be used to request cancellation of an operation.
     *
     * @class
     * @param {Function} executor The executor function.
     */
    function CancelToken(executor) {
      if (typeof executor !== 'function') {
        throw new TypeError('executor must be a function.');
      }

      var resolvePromise;
      this.promise = new Promise(function promiseExecutor(resolve) {
        resolvePromise = resolve;
      });

      var token = this;
      executor(function cancel(message) {
        if (token.reason) {
          // Cancellation has already been requested
          return;
        }

        token.reason = new Cancel_1(message);
        resolvePromise(token.reason);
      });
    }

    /**
     * Throws a `Cancel` if cancellation has been requested.
     */
    CancelToken.prototype.throwIfRequested = function throwIfRequested() {
      if (this.reason) {
        throw this.reason;
      }
    };

    /**
     * Returns an object that contains a new `CancelToken` and a function that, when called,
     * cancels the `CancelToken`.
     */
    CancelToken.source = function source() {
      var cancel;
      var token = new CancelToken(function executor(c) {
        cancel = c;
      });
      return {
        token: token,
        cancel: cancel
      };
    };

    var CancelToken_1 = CancelToken;

    /**
     * Syntactic sugar for invoking a function and expanding an array for arguments.
     *
     * Common use case would be to use `Function.prototype.apply`.
     *
     *  ```js
     *  function f(x, y, z) {}
     *  var args = [1, 2, 3];
     *  f.apply(null, args);
     *  ```
     *
     * With `spread` this example can be re-written.
     *
     *  ```js
     *  spread(function(x, y, z) {})([1, 2, 3]);
     *  ```
     *
     * @param {Function} callback
     * @returns {Function}
     */
    var spread = function spread(callback) {
      return function wrap(arr) {
        return callback.apply(null, arr);
      };
    };

    /**
     * Create an instance of Axios
     *
     * @param {Object} defaultConfig The default config for the instance
     * @return {Axios} A new instance of Axios
     */
    function createInstance(defaultConfig) {
      var context = new Axios_1(defaultConfig);
      var instance = bind(Axios_1.prototype.request, context);

      // Copy axios.prototype to instance
      utils.extend(instance, Axios_1.prototype, context);

      // Copy context to instance
      utils.extend(instance, context);

      return instance;
    }

    // Create the default instance to be exported
    var axios = createInstance(defaults_1);

    // Expose Axios class to allow class inheritance
    axios.Axios = Axios_1;

    // Factory for creating new instances
    axios.create = function create(instanceConfig) {
      return createInstance(mergeConfig(axios.defaults, instanceConfig));
    };

    // Expose Cancel & CancelToken
    axios.Cancel = Cancel_1;
    axios.CancelToken = CancelToken_1;
    axios.isCancel = isCancel;

    // Expose all/spread
    axios.all = function all(promises) {
      return Promise.all(promises);
    };
    axios.spread = spread;

    var axios_1 = axios;

    // Allow use of default import syntax in TypeScript
    var default_1 = axios;
    axios_1.default = default_1;

    var axios$1 = axios_1;

    function createCommonjsModule(fn, module) {
    	return module = { exports: {} }, fn(module, module.exports), module.exports;
    }

    var js_cookie = createCommonjsModule(function (module, exports) {
    (function (factory) {
    	var registeredInModuleLoader;
    	{
    		module.exports = factory();
    		registeredInModuleLoader = true;
    	}
    	if (!registeredInModuleLoader) {
    		var OldCookies = window.Cookies;
    		var api = window.Cookies = factory();
    		api.noConflict = function () {
    			window.Cookies = OldCookies;
    			return api;
    		};
    	}
    }(function () {
    	function extend () {
    		var i = 0;
    		var result = {};
    		for (; i < arguments.length; i++) {
    			var attributes = arguments[ i ];
    			for (var key in attributes) {
    				result[key] = attributes[key];
    			}
    		}
    		return result;
    	}

    	function decode (s) {
    		return s.replace(/(%[0-9A-Z]{2})+/g, decodeURIComponent);
    	}

    	function init (converter) {
    		function api() {}

    		function set (key, value, attributes) {
    			if (typeof document === 'undefined') {
    				return;
    			}

    			attributes = extend({
    				path: '/'
    			}, api.defaults, attributes);

    			if (typeof attributes.expires === 'number') {
    				attributes.expires = new Date(new Date() * 1 + attributes.expires * 864e+5);
    			}

    			// We're using "expires" because "max-age" is not supported by IE
    			attributes.expires = attributes.expires ? attributes.expires.toUTCString() : '';

    			try {
    				var result = JSON.stringify(value);
    				if (/^[\{\[]/.test(result)) {
    					value = result;
    				}
    			} catch (e) {}

    			value = converter.write ?
    				converter.write(value, key) :
    				encodeURIComponent(String(value))
    					.replace(/%(23|24|26|2B|3A|3C|3E|3D|2F|3F|40|5B|5D|5E|60|7B|7D|7C)/g, decodeURIComponent);

    			key = encodeURIComponent(String(key))
    				.replace(/%(23|24|26|2B|5E|60|7C)/g, decodeURIComponent)
    				.replace(/[\(\)]/g, escape);

    			var stringifiedAttributes = '';
    			for (var attributeName in attributes) {
    				if (!attributes[attributeName]) {
    					continue;
    				}
    				stringifiedAttributes += '; ' + attributeName;
    				if (attributes[attributeName] === true) {
    					continue;
    				}

    				// Considers RFC 6265 section 5.2:
    				// ...
    				// 3.  If the remaining unparsed-attributes contains a %x3B (";")
    				//     character:
    				// Consume the characters of the unparsed-attributes up to,
    				// not including, the first %x3B (";") character.
    				// ...
    				stringifiedAttributes += '=' + attributes[attributeName].split(';')[0];
    			}

    			return (document.cookie = key + '=' + value + stringifiedAttributes);
    		}

    		function get (key, json) {
    			if (typeof document === 'undefined') {
    				return;
    			}

    			var jar = {};
    			// To prevent the for loop in the first place assign an empty array
    			// in case there are no cookies at all.
    			var cookies = document.cookie ? document.cookie.split('; ') : [];
    			var i = 0;

    			for (; i < cookies.length; i++) {
    				var parts = cookies[i].split('=');
    				var cookie = parts.slice(1).join('=');

    				if (!json && cookie.charAt(0) === '"') {
    					cookie = cookie.slice(1, -1);
    				}

    				try {
    					var name = decode(parts[0]);
    					cookie = (converter.read || converter)(cookie, name) ||
    						decode(cookie);

    					if (json) {
    						try {
    							cookie = JSON.parse(cookie);
    						} catch (e) {}
    					}

    					jar[name] = cookie;

    					if (key === name) {
    						break;
    					}
    				} catch (e) {}
    			}

    			return key ? jar[key] : jar;
    		}

    		api.set = set;
    		api.get = function (key) {
    			return get(key, false /* read as raw */);
    		};
    		api.getJSON = function (key) {
    			return get(key, true /* read as json */);
    		};
    		api.remove = function (key, attributes) {
    			set(key, '', extend(attributes, {
    				expires: -1
    			}));
    		};

    		api.defaults = {};

    		api.withConverter = init;

    		return api;
    	}

    	return init(function () {});
    }));
    });

    class Api {
      constructor() {
        this.http = axios$1.create({
          baseURL: 'http://localhost:3000/api/v2/storefront'
        });
        this.http.interceptors.request.use(request => {
          console.log('Request:', request.url);
          return request
        }, error => {
          console.log('Request Error:', error);
        });

        this.http.interceptors.response.use(response => {
          console.log('Response:', response.config.url, response.status);
          return response
        }, error => {
          console.log('Response Error:', error);
        });
      }

      getOrderToken() {
        return js_cookie.get("orderToken");
      }

      getHeaders() {
        const token = js_cookie.get("orderToken");
        return ({
          headers: {
            "X-Spree-Order-Token": token
          }
        })
      }
    }

    class Cart extends Api {

      constructor() {
        super();
        this.endpoint = '/cart';
      }

      decorated(endpoint) {
        return `${endpoint}?include=line_items`
      }

      async fetch() {
        const token = this.getOrderToken();
        if (token) {
          return this.http.get(
            this.decorated(this.endpoint),
            this.getHeaders()
          ).then(resp => resp.data)
        } else {
          return this.post(this.decorated(this.endpoint))
            .then(response => {
              const orderToken = response.data.data.attributes.token;
              js_cookie.set("orderToken", orderToken);
              return response.data;
            });
        }
      }

      async addItem(variant_id) {
        return this.http.post(
          this.decorated(`${this.endpoint}/add_item`),
          {
            variant_id,
            "quantity": 1
          },
          this.getHeaders()
        ).then(resp => resp.data)
      }

      async removeLineItem(line_item_id) {
        return this.http.delete(
          `${this.endpoint}/remove_line_item/${line_item_id}`,
          this.getHeaders()
        ).then(resp => resp.data)
      }

      async setQuantity(line_item_id, quantity) {
        console.log(line_item_id, quantity);
        return this.http.patch(
          this.decorated(`${this.endpoint}/set_quantity`),
          {
            line_item_id,
            quantity
          },
          this.getHeaders()
        ).then(resp => resp.data)
      }

      async empty(line_item_id, quantity) {
        return this.http.patch(
          this.decorated(`${this.endpoint}/empty`),
          {

          },
          this.getHeaders()
        ).then(resp => resp.data)
      }
    }

    const cart = new Cart();

    function createCartStatus() {
      const { subscribe, set } = writable({
        status: "unknown"
      });
      return {
        subscribe,
        restore: () => {
          set({
            status: "in-progress"
          });
          cart.fetch().then(val => {
            setTimeout(() => {
              set({
                status: "restored"
              });
              console.log("Restored:", val);
              cart$1.restore(val);
            }, 1500);
          });
        }
      };
    }

    function createCart() {
      const { subscribe, set, update } = writable({});
      return {
        subscribe,
        addProduct: product => {
          const productId = `${product.id}`;
          update(prevCart => {
            const existing = prevCart.included && prevCart.included.length > 0 && prevCart.included.find(lineItem => lineItem.relationships.variant.data.id === productId);
            if (existing) {
              // set quantity
              cart.setQuantity(existing.id, existing.attributes.quantity + 1).then(cart => set(cart));
            } else {
              cart.addItem(productId).then(cart => set(cart));
            }
            return prevCart
          });
        },
        increaseQuantity: product => {
          const productId = `${product.id}`;
          update(prevCart => {
            const existing = prevCart.included && prevCart.included.length > 0 && prevCart.included.find(lineItem => lineItem.relationships.variant.data.id === productId);
            if (existing) {
              // set quantity
              cart.setQuantity(existing.id, existing.attributes.quantity + 1).then(cart => set(cart));
            } else {
              cart.addItem(productId).then(cart => set(cart));
            }
            return prevCart
          });
        },
        decreaseQuantity: product => {
          const productId = `${product.id}`;
          update(prevCart => {
            const existing = prevCart.included && prevCart.included.length > 0 && prevCart.included.find(lineItem => lineItem.relationships.variant.data.id === productId);
            if (existing) {
              // set quantity
              const quantity = existing.attributes.quantity - 1;
              if (quantity === 0) {
                cart.removeLineItem(existing.id).then(cart => set(cart));
              } else {
                cart.setQuantity(existing.id, quantity).then(cart => set(cart));
              }
            }
            return prevCart
          });
        },
        removeProduct: product => {
          const productId = `${product.id}`;
          update(prevCart => {
            const existing = prevCart.included && prevCart.included.length > 0 && prevCart.included.find(lineItem => lineItem.relationships.variant.data.id === productId);
            if (existing) {
              cart.removeLineItem(existing.id).then(cart => set(cart));
            }
            return prevCart
          });
        },
        reset: () => {
          cart.empty().then(() => {
            set({});
          });
        },
        restore: cart => {
          set(cart);
        }
      };
    }

    const cart$1 = createCart();
    const cartStatus = createCartStatus();

    const isCartRestored = derived(
      cartStatus,
      $cartStatus => $cartStatus.status === "restored"
    );

    const displayCart = derived(
      cart$1,
      $cart => {
        const lineItems = $cart.included;

        if (lineItems) {
          const products = lineItems.map(item => {
            return {
              product: {
                id: item.relationships.variant.data.id,
                name: item.attributes.name,
                price: item.attributes.price
              },
              quantity: item.attributes.quantity,
              total: item.attributes.total
            }
          });
          return products
        }
        return []
      }
    );
    cartStatus.restore();

    /* svelte/AddToCart.svelte generated by Svelte v3.19.1 */
    const file = "svelte/AddToCart.svelte";

    // (46:2) {:else}
    function create_else_block(ctx) {
    	let svg;
    	let rect0;
    	let animateTransform0;
    	let rect1;
    	let animateTransform1;
    	let rect2;
    	let animateTransform2;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			rect0 = svg_element("rect");
    			animateTransform0 = svg_element("animateTransform");
    			rect1 = svg_element("rect");
    			animateTransform1 = svg_element("animateTransform");
    			rect2 = svg_element("rect");
    			animateTransform2 = svg_element("animateTransform");
    			attr_dev(animateTransform0, "attributeType", "xml");
    			attr_dev(animateTransform0, "attributeName", "transform");
    			attr_dev(animateTransform0, "type", "translate");
    			attr_dev(animateTransform0, "values", "0 0; 0 20; 0 0");
    			attr_dev(animateTransform0, "begin", "0");
    			attr_dev(animateTransform0, "dur", "0.6s");
    			attr_dev(animateTransform0, "repeatCount", "indefinite");
    			add_location(animateTransform0, file, 59, 8, 2161);
    			attr_dev(rect0, "x", "0");
    			attr_dev(rect0, "y", "0");
    			attr_dev(rect0, "width", "7");
    			attr_dev(rect0, "height", "30");
    			attr_dev(rect0, "fill", "#fff");
    			add_location(rect0, file, 58, 6, 2100);
    			attr_dev(animateTransform1, "attributeType", "xml");
    			attr_dev(animateTransform1, "attributeName", "transform");
    			attr_dev(animateTransform1, "type", "translate");
    			attr_dev(animateTransform1, "values", "0 0; 0 20; 0 0");
    			attr_dev(animateTransform1, "begin", "0.2s");
    			attr_dev(animateTransform1, "dur", "0.6s");
    			attr_dev(animateTransform1, "repeatCount", "indefinite");
    			add_location(animateTransform1, file, 69, 8, 2467);
    			attr_dev(rect1, "x", "24");
    			attr_dev(rect1, "y", "0");
    			attr_dev(rect1, "width", "7");
    			attr_dev(rect1, "height", "30");
    			attr_dev(rect1, "fill", "#fff");
    			add_location(rect1, file, 68, 6, 2405);
    			attr_dev(animateTransform2, "attributeType", "xml");
    			attr_dev(animateTransform2, "attributeName", "transform");
    			attr_dev(animateTransform2, "type", "translate");
    			attr_dev(animateTransform2, "values", "0 0; 0 20; 0 0");
    			attr_dev(animateTransform2, "begin", "0.4s");
    			attr_dev(animateTransform2, "dur", "0.6s");
    			attr_dev(animateTransform2, "repeatCount", "indefinite");
    			add_location(animateTransform2, file, 79, 8, 2776);
    			attr_dev(rect2, "x", "48");
    			attr_dev(rect2, "y", "0");
    			attr_dev(rect2, "width", "7");
    			attr_dev(rect2, "height", "30");
    			attr_dev(rect2, "fill", "#fff");
    			add_location(rect2, file, 78, 6, 2714);
    			attr_dev(svg, "version", "1.1");
    			attr_dev(svg, "id", "L9");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "xmlns:xlink", "http://www.w3.org/1999/xlink");
    			attr_dev(svg, "x", "0px");
    			attr_dev(svg, "y", "0px");
    			attr_dev(svg, "width", "32");
    			attr_dev(svg, "height", "32");
    			attr_dev(svg, "viewBox", "0 0 100 100");
    			attr_dev(svg, "enable-background", "new 0 0 0 0");
    			attr_dev(svg, "xml:space", "preserve");
    			add_location(svg, file, 46, 4, 1808);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, rect0);
    			append_dev(rect0, animateTransform0);
    			append_dev(svg, rect1);
    			append_dev(rect1, animateTransform1);
    			append_dev(svg, rect2);
    			append_dev(rect2, animateTransform2);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(46:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (24:2) {#if $isCartRestored == true}
    function create_if_block(ctx) {
    	let svg;
    	let path;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr_dev(path, "d", "M.5696813.18292095c-.31297 0-.56666667.24569817-.56666667.54878049 0\n        .30308232.25369667.54878049.56666667.54878049h1.80625003L4.323848\n        10.1810155c.07706667.3350487.30380889.6139024.59027778.6116707h9.44444442c.29937.0040244.5747313-.2588232.5747313-.5487805\n        0-.28995731-.2753613-.55287804-.5747313-.54878048H5.37454244l-.24202333-1.09757927h9.98160569c.2537156-.00182927.4934345-.18896341.5489489-.42872561l1.3222222-5.48780488c.0736856-.31848841-.2119333-.66648658-.5489488-.66882622H3.69815356L3.39120911.61737217C3.33758356.37369534\n        3.09361467.18266485 2.836348.18292095H.5696813zM6.80301467\n        11.1585399c-1.03649 0-1.88888889.8254756-1.88888889 1.8292682 0\n        1.0037744.85239889 1.8292683 1.88888889 1.8292683 1.03649 0\n        1.88888889-.8254939 1.88888889-1.8292683\n        0-1.0037743-.85239889-1.8292682-1.88888889-1.8292682zm5.66666663\n        0c-1.03649 0-1.8888889.8254756-1.8888889 1.8292682 0 1.0037744.8523989\n        1.8292683 1.8888889 1.8292683 1.03649 0 1.8888889-.8254939\n        1.8888889-1.8292683 0-1.0037743-.8523989-1.8292682-1.8888889-1.8292682z");
    			attr_dev(path, "fill", "#FFF");
    			attr_dev(path, "fill-rule", "evenodd");
    			add_location(path, file, 29, 6, 599);
    			attr_dev(svg, "width", "15");
    			attr_dev(svg, "height", "13");
    			attr_dev(svg, "viewBox", "0 0 17 15");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			add_location(svg, file, 24, 4, 485);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, path);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(24:2) {#if $isCartRestored == true}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let a;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*$isCartRestored*/ ctx[0] == true) return create_if_block;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			a = element("a");
    			if_block.c();
    			attr_dev(a, "href", "#");
    			attr_dev(a, "data-id", "product checked");
    			attr_dev(a, "class", "add-to-cart");
    			add_location(a, file, 17, 0, 339);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			if_block.m(a, null);

    			dispose = [
    				listen_dev(a, "click", /*addToCart*/ ctx[1], false, false, false),
    				listen_dev(a, "click", showCart, false, false, false)
    			];
    		},
    		p: function update(ctx, [dirty]) {
    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(a, null);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    			if_block.d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function showCart() {
    	let cart = document.getElementById("cart");
    	cart.classList.add("show-cart");
    }

    function instance($$self, $$props, $$invalidate) {
    	let $isCartRestored;
    	validate_store(isCartRestored, "isCartRestored");
    	component_subscribe($$self, isCartRestored, $$value => $$invalidate(0, $isCartRestored = $$value));
    	let { product } = $$props;

    	function addToCart() {
    		cart$1.addProduct(product);
    	}

    	onMount(async () => {
    		
    	});

    	const writable_props = ["product"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<AddToCart> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("product" in $$props) $$invalidate(2, product = $$props.product);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		cart: cart$1,
    		isCartRestored,
    		product,
    		addToCart,
    		showCart,
    		document,
    		$isCartRestored
    	});

    	$$self.$inject_state = $$props => {
    		if ("product" in $$props) $$invalidate(2, product = $$props.product);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [$isCartRestored, addToCart, product];
    }

    class AddToCart extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { product: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "AddToCart",
    			options,
    			id: create_fragment.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*product*/ ctx[2] === undefined && !("product" in props)) {
    			console.warn("<AddToCart> was created without expected prop 'product'");
    		}
    	}

    	get product() {
    		throw new Error("<AddToCart>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set product(value) {
    		throw new Error("<AddToCart>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const cartStatus$1 = writable("");
    // return {
    //   subscribe,
    //   setStatus: () => {
    //     if (state == 2) {
    //       set({ status: "expandCart" });
    //     } else if (state == 3) {
    //       set({ status: "showPayment" });
    //     } else if (state == 4) {
    //       set({ status: "showConfirmation" });
    //     }
    //   }
    // };

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }
    function quintOut(t) {
        return --t * t * t * t * t + 1;
    }

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */

    function __rest(s, e) {
        var t = {};
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                    t[p[i]] = s[p[i]];
            }
        return t;
    }
    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }
    function crossfade(_a) {
        var { fallback } = _a, defaults = __rest(_a, ["fallback"]);
        const to_receive = new Map();
        const to_send = new Map();
        function crossfade(from, node, params) {
            const { delay = 0, duration = d => Math.sqrt(d) * 30, easing = cubicOut } = assign(assign({}, defaults), params);
            const to = node.getBoundingClientRect();
            const dx = from.left - to.left;
            const dy = from.top - to.top;
            const dw = from.width / to.width;
            const dh = from.height / to.height;
            const d = Math.sqrt(dx * dx + dy * dy);
            const style = getComputedStyle(node);
            const transform = style.transform === 'none' ? '' : style.transform;
            const opacity = +style.opacity;
            return {
                delay,
                duration: is_function(duration) ? duration(d) : duration,
                easing,
                css: (t, u) => `
				opacity: ${t * opacity};
				transform-origin: top left;
				transform: ${transform} translate(${u * dx}px,${u * dy}px) scale(${t + (1 - t) * dw}, ${t + (1 - t) * dh});
			`
            };
        }
        function transition(items, counterparts, intro) {
            return (node, params) => {
                items.set(params.key, {
                    rect: node.getBoundingClientRect()
                });
                return () => {
                    if (counterparts.has(params.key)) {
                        const { rect } = counterparts.get(params.key);
                        counterparts.delete(params.key);
                        return crossfade(rect, node, params);
                    }
                    // if the node is disappearing altogether
                    // (i.e. wasn't claimed by the other list)
                    // then we need to supply an outro
                    items.delete(params.key);
                    return fallback && fallback(node, params, intro);
                };
            };
        }
        return [
            transition(to_send, to_receive, false),
            transition(to_receive, to_send, true)
        ];
    }

    function flip(node, animation, params) {
        const style = getComputedStyle(node);
        const transform = style.transform === 'none' ? '' : style.transform;
        const scaleX = animation.from.width / node.clientWidth;
        const scaleY = animation.from.height / node.clientHeight;
        const dx = (animation.from.left - animation.to.left) / scaleX;
        const dy = (animation.from.top - animation.to.top) / scaleY;
        const d = Math.sqrt(dx * dx + dy * dy);
        const { delay = 0, duration = (d) => Math.sqrt(d) * 120, easing = cubicOut } = params;
        return {
            delay,
            duration: is_function(duration) ? duration(d) : duration,
            easing,
            css: (_t, u) => `transform: ${transform} translate(${u * dx}px, ${u * dy}px);`
        };
    }

    /* svelte/CartItem.svelte generated by Svelte v3.19.1 */
    const file$1 = "svelte/CartItem.svelte";

    function create_fragment$1(ctx) {
    	let div7;
    	let div0;
    	let img;
    	let img_src_value;
    	let t0;
    	let div6;
    	let div3;
    	let p0;
    	let t1_value = /*product*/ ctx[0].name + "";
    	let t1;
    	let t2;
    	let div1;
    	let t3;
    	let div2;
    	let a0;
    	let t5;
    	let div5;
    	let div4;
    	let t6;
    	let t7_value = /*product*/ ctx[0].price + "";
    	let t7;
    	let t8;
    	let t9;
    	let t10;
    	let p1;
    	let a1;
    	let t12;
    	let span;
    	let t13;
    	let t14;
    	let a2;
    	let t16;
    	let p2;
    	let t17;
    	let t18;
    	let div7_data_line_item_id_value;
    	let dispose;

    	const block = {
    		c: function create() {
    			div7 = element("div");
    			div0 = element("div");
    			img = element("img");
    			t0 = space();
    			div6 = element("div");
    			div3 = element("div");
    			p0 = element("p");
    			t1 = text(t1_value);
    			t2 = space();
    			div1 = element("div");
    			t3 = space();
    			div2 = element("div");
    			a0 = element("a");
    			a0.textContent = "Remove";
    			t5 = space();
    			div5 = element("div");
    			div4 = element("div");
    			t6 = text("Rs. ");
    			t7 = text(t7_value);
    			t8 = text(" * ");
    			t9 = text(/*quantity*/ ctx[1]);
    			t10 = space();
    			p1 = element("p");
    			a1 = element("a");
    			a1.textContent = "-";
    			t12 = space();
    			span = element("span");
    			t13 = text(/*quantity*/ ctx[1]);
    			t14 = space();
    			a2 = element("a");
    			a2.textContent = "+";
    			t16 = space();
    			p2 = element("p");
    			t17 = text("Rs. ");
    			t18 = text(/*total*/ ctx[2]);
    			if (img.src !== (img_src_value = /*product*/ ctx[0].image)) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "");
    			attr_dev(img, "class", "w-full");
    			add_location(img, file$1, 44, 4, 1046);
    			attr_dev(div0, "class", "w-16 h-12 mr-2 overflow-hidden rounded-4");
    			add_location(div0, file$1, 43, 2, 987);
    			attr_dev(p0, "class", "flex-auto text-lg leading-none");
    			add_location(p0, file$1, 48, 6, 1157);
    			attr_dev(div1, "class", "line-item-quantity");
    			add_location(div1, file$1, 49, 6, 1224);
    			attr_dev(a0, "href", "#");
    			attr_dev(a0, "class", "text-red-300");
    			add_location(a0, file$1, 51, 8, 1309);
    			attr_dev(div2, "class", "ml-4 line-item-remove");
    			add_location(div2, file$1, 50, 6, 1265);
    			attr_dev(div3, "class", "flex");
    			add_location(div3, file$1, 47, 4, 1132);
    			attr_dev(div4, "class", "mr-4 text-sm italic");
    			add_location(div4, file$1, 55, 6, 1438);
    			attr_dev(a1, "href", "#");
    			attr_dev(a1, "class", "bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-1 px-2\n          rounded-full");
    			add_location(a1, file$1, 57, 8, 1572);
    			attr_dev(span, "class", "px-2");
    			add_location(span, file$1, 64, 8, 1764);
    			attr_dev(a2, "href", "#");
    			attr_dev(a2, "class", "bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-1 px-2\n          rounded-full");
    			add_location(a2, file$1, 65, 8, 1809);
    			attr_dev(p1, "class", "text-sm opacity-50 line-item-remove");
    			add_location(p1, file$1, 56, 6, 1516);
    			attr_dev(p2, "class", "text-right flex-auto font-bold");
    			add_location(p2, file$1, 73, 6, 2010);
    			attr_dev(div5, "class", "flex block");
    			add_location(div5, file$1, 54, 4, 1407);
    			attr_dev(div6, "class", "w-full");
    			add_location(div6, file$1, 46, 2, 1107);
    			attr_dev(div7, "class", "flex flex-auto");
    			attr_dev(div7, "data-line-item-id", div7_data_line_item_id_value = /*product*/ ctx[0].id);
    			add_location(div7, file$1, 42, 0, 925);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div7, anchor);
    			append_dev(div7, div0);
    			append_dev(div0, img);
    			append_dev(div7, t0);
    			append_dev(div7, div6);
    			append_dev(div6, div3);
    			append_dev(div3, p0);
    			append_dev(p0, t1);
    			append_dev(div3, t2);
    			append_dev(div3, div1);
    			append_dev(div3, t3);
    			append_dev(div3, div2);
    			append_dev(div2, a0);
    			append_dev(div6, t5);
    			append_dev(div6, div5);
    			append_dev(div5, div4);
    			append_dev(div4, t6);
    			append_dev(div4, t7);
    			append_dev(div4, t8);
    			append_dev(div4, t9);
    			append_dev(div5, t10);
    			append_dev(div5, p1);
    			append_dev(p1, a1);
    			append_dev(p1, t12);
    			append_dev(p1, span);
    			append_dev(span, t13);
    			append_dev(p1, t14);
    			append_dev(p1, a2);
    			append_dev(div5, t16);
    			append_dev(div5, p2);
    			append_dev(p2, t17);
    			append_dev(p2, t18);

    			dispose = [
    				listen_dev(a0, "click", /*removeFromCart*/ ctx[3], false, false, false),
    				listen_dev(a1, "click", /*decrement*/ ctx[5], false, false, false),
    				listen_dev(a2, "click", /*increment*/ ctx[4], false, false, false)
    			];
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*product*/ 1 && img.src !== (img_src_value = /*product*/ ctx[0].image)) {
    				attr_dev(img, "src", img_src_value);
    			}

    			if (dirty & /*product*/ 1 && t1_value !== (t1_value = /*product*/ ctx[0].name + "")) set_data_dev(t1, t1_value);
    			if (dirty & /*product*/ 1 && t7_value !== (t7_value = /*product*/ ctx[0].price + "")) set_data_dev(t7, t7_value);
    			if (dirty & /*quantity*/ 2) set_data_dev(t9, /*quantity*/ ctx[1]);
    			if (dirty & /*quantity*/ 2) set_data_dev(t13, /*quantity*/ ctx[1]);
    			if (dirty & /*total*/ 4) set_data_dev(t18, /*total*/ ctx[2]);

    			if (dirty & /*product*/ 1 && div7_data_line_item_id_value !== (div7_data_line_item_id_value = /*product*/ ctx[0].id)) {
    				attr_dev(div7, "data-line-item-id", div7_data_line_item_id_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div7);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { product } = $$props;
    	let { quantity } = $$props;
    	let { total } = $$props;

    	function removeFromCart() {
    		cart$1.removeProduct(product);
    	}

    	function increment() {
    		cart$1.increaseQuantity(product);
    	}

    	function decrement() {
    		cart$1.decreaseQuantity(product);
    	}

    	const [send, receive] = crossfade({
    		duration: d => Math.sqrt(d * 200),
    		fallback(node, params) {
    			const style = getComputedStyle(node);
    			const transform = style.transform === "none" ? "" : style.transform;

    			return {
    				duration: 600,
    				easing: quintOut,
    				css: t => `
					transform: ${transform} scale(${t});
					opacity: ${t}
				`
    			};
    		}
    	});

    	onMount(async () => {
    		
    	});

    	const writable_props = ["product", "quantity", "total"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<CartItem> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("product" in $$props) $$invalidate(0, product = $$props.product);
    		if ("quantity" in $$props) $$invalidate(1, quantity = $$props.quantity);
    		if ("total" in $$props) $$invalidate(2, total = $$props.total);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		cart: cart$1,
    		crossfade,
    		flip,
    		quintOut,
    		product,
    		quantity,
    		total,
    		removeFromCart,
    		increment,
    		decrement,
    		send,
    		receive,
    		Math,
    		getComputedStyle
    	});

    	$$self.$inject_state = $$props => {
    		if ("product" in $$props) $$invalidate(0, product = $$props.product);
    		if ("quantity" in $$props) $$invalidate(1, quantity = $$props.quantity);
    		if ("total" in $$props) $$invalidate(2, total = $$props.total);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [product, quantity, total, removeFromCart, increment, decrement];
    }

    class CartItem extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { product: 0, quantity: 1, total: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "CartItem",
    			options,
    			id: create_fragment$1.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*product*/ ctx[0] === undefined && !("product" in props)) {
    			console.warn("<CartItem> was created without expected prop 'product'");
    		}

    		if (/*quantity*/ ctx[1] === undefined && !("quantity" in props)) {
    			console.warn("<CartItem> was created without expected prop 'quantity'");
    		}

    		if (/*total*/ ctx[2] === undefined && !("total" in props)) {
    			console.warn("<CartItem> was created without expected prop 'total'");
    		}
    	}

    	get product() {
    		throw new Error("<CartItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set product(value) {
    		throw new Error("<CartItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get quantity() {
    		throw new Error("<CartItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set quantity(value) {
    		throw new Error("<CartItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get total() {
    		throw new Error("<CartItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set total(value) {
    		throw new Error("<CartItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const email = writable("");

    const phone = writable("");
    const name = writable("");
    const zip = writable("");
    const city = writable("");
    const state = writable("");
    const address = writable("");

    const [send, receive] = crossfade({
      duration: d => Math.sqrt(d * 200),
      fallback(node, params) {
        const style = getComputedStyle(node);
        const transform = style.transform === "none" ? "" : style.transform;

        return {
          duration: 600,
          easing: quintOut,
          css: t => `
                opacity: ${t}
            `
        };
      }
    });

    /* svelte/ShippingDetails.svelte generated by Svelte v3.19.1 */
    const file$2 = "svelte/ShippingDetails.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[22] = list[i].product;
    	child_ctx[23] = list[i].quantity;
    	child_ctx[24] = list[i].total;
    	return child_ctx;
    }

    // (72:45) 
    function create_if_block_2(ctx) {
    	let div4;
    	let label0;
    	let t1;
    	let input0;
    	let t2;
    	let div3;
    	let div0;
    	let label1;
    	let t4;
    	let input1;
    	let t5;
    	let div1;
    	let label2;
    	let t7;
    	let input2;
    	let t8;
    	let div2;
    	let label3;
    	let t10;
    	let input3;
    	let dispose;

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			label0 = element("label");
    			label0.textContent = "Card Number";
    			t1 = space();
    			input0 = element("input");
    			t2 = space();
    			div3 = element("div");
    			div0 = element("div");
    			label1 = element("label");
    			label1.textContent = "CVV";
    			t4 = space();
    			input1 = element("input");
    			t5 = space();
    			div1 = element("div");
    			label2 = element("label");
    			label2.textContent = "Expiry";
    			t7 = space();
    			input2 = element("input");
    			t8 = space();
    			div2 = element("div");
    			label3 = element("label");
    			label3.textContent = "Name on Card";
    			t10 = space();
    			input3 = element("input");
    			attr_dev(label0, "class", "address-label");
    			attr_dev(label0, "for", "card-number");
    			add_location(label0, file$2, 73, 10, 2563);
    			attr_dev(input0, "class", "address-input focus:outline-none focus:border-blue-500");
    			add_location(input0, file$2, 74, 10, 2640);
    			attr_dev(label1, "class", "address-label");
    			attr_dev(label1, "for", "cvv");
    			add_location(label1, file$2, 79, 14, 2850);
    			attr_dev(input1, "class", "address-input focus:outline-none focus:border-blue-500");
    			add_location(input1, file$2, 80, 14, 2915);
    			attr_dev(div0, "class", "mr-8");
    			add_location(div0, file$2, 78, 12, 2817);
    			attr_dev(label2, "class", "address-label");
    			attr_dev(label2, "for", "expiry");
    			add_location(label2, file$2, 85, 14, 3116);
    			attr_dev(input2, "class", "address-input flex-auto focus:outline-none\n                focus:border-blue-500");
    			add_location(input2, file$2, 86, 14, 3187);
    			attr_dev(div1, "class", "mr-8");
    			add_location(div1, file$2, 84, 12, 3083);
    			attr_dev(label3, "class", "address-label");
    			attr_dev(label3, "for", "name-on-card");
    			add_location(label3, file$2, 92, 14, 3422);
    			attr_dev(input3, "class", "address-input flex-auto focus:outline-none\n                focus:border-blue-500");
    			add_location(input3, file$2, 95, 14, 3537);
    			attr_dev(div2, "class", "flex-auto");
    			add_location(div2, file$2, 91, 12, 3384);
    			attr_dev(div3, "class", "flex");
    			add_location(div3, file$2, 77, 10, 2786);
    			attr_dev(div4, "class", "pr-16");
    			add_location(div4, file$2, 72, 8, 2533);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, label0);
    			append_dev(div4, t1);
    			append_dev(div4, input0);
    			set_input_value(input0, /*paymentDetails*/ ctx[0].cardNumber);
    			append_dev(div4, t2);
    			append_dev(div4, div3);
    			append_dev(div3, div0);
    			append_dev(div0, label1);
    			append_dev(div0, t4);
    			append_dev(div0, input1);
    			set_input_value(input1, /*paymentDetails*/ ctx[0].cvv);
    			append_dev(div3, t5);
    			append_dev(div3, div1);
    			append_dev(div1, label2);
    			append_dev(div1, t7);
    			append_dev(div1, input2);
    			set_input_value(input2, /*paymentDetails*/ ctx[0].expiry);
    			append_dev(div3, t8);
    			append_dev(div3, div2);
    			append_dev(div2, label3);
    			append_dev(div2, t10);
    			append_dev(div2, input3);
    			set_input_value(input3, /*paymentDetails*/ ctx[0].name);

    			dispose = [
    				listen_dev(input0, "input", /*input0_input_handler_1*/ ctx[18]),
    				listen_dev(input1, "input", /*input1_input_handler_1*/ ctx[19]),
    				listen_dev(input2, "input", /*input2_input_handler_1*/ ctx[20]),
    				listen_dev(input3, "input", /*input3_input_handler_1*/ ctx[21])
    			];
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*paymentDetails*/ 1 && input0.value !== /*paymentDetails*/ ctx[0].cardNumber) {
    				set_input_value(input0, /*paymentDetails*/ ctx[0].cardNumber);
    			}

    			if (dirty & /*paymentDetails*/ 1 && input1.value !== /*paymentDetails*/ ctx[0].cvv) {
    				set_input_value(input1, /*paymentDetails*/ ctx[0].cvv);
    			}

    			if (dirty & /*paymentDetails*/ 1 && input2.value !== /*paymentDetails*/ ctx[0].expiry) {
    				set_input_value(input2, /*paymentDetails*/ ctx[0].expiry);
    			}

    			if (dirty & /*paymentDetails*/ 1 && input3.value !== /*paymentDetails*/ ctx[0].name) {
    				set_input_value(input3, /*paymentDetails*/ ctx[0].name);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(72:45) ",
    		ctx
    	});

    	return block;
    }

    // (39:6) {#if $cartStatus == 'expandCart'}
    function create_if_block_1(ctx) {
    	let div1;
    	let div0;
    	let label0;
    	let t1;
    	let input0;
    	let t2;
    	let label1;
    	let t4;
    	let input1;
    	let t5;
    	let label2;
    	let t7;
    	let input2;
    	let t8;
    	let label3;
    	let t10;
    	let input3;
    	let t11;
    	let label4;
    	let t13;
    	let input4;
    	let t14;
    	let label5;
    	let t16;
    	let input5;
    	let t17;
    	let label6;
    	let t19;
    	let input6;
    	let dispose;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			label0 = element("label");
    			label0.textContent = "Email";
    			t1 = space();
    			input0 = element("input");
    			t2 = space();
    			label1 = element("label");
    			label1.textContent = "Phone";
    			t4 = space();
    			input1 = element("input");
    			t5 = space();
    			label2 = element("label");
    			label2.textContent = "Name";
    			t7 = space();
    			input2 = element("input");
    			t8 = space();
    			label3 = element("label");
    			label3.textContent = "Zip";
    			t10 = space();
    			input3 = element("input");
    			t11 = space();
    			label4 = element("label");
    			label4.textContent = "City";
    			t13 = space();
    			input4 = element("input");
    			t14 = space();
    			label5 = element("label");
    			label5.textContent = "State";
    			t16 = space();
    			input5 = element("input");
    			t17 = space();
    			label6 = element("label");
    			label6.textContent = "Address";
    			t19 = space();
    			input6 = element("input");
    			attr_dev(label0, "class", "address-label");
    			attr_dev(label0, "for", "email");
    			add_location(label0, file$2, 41, 12, 1113);
    			attr_dev(input0, "class", "address-input focus:outline-none focus:border-blue-500");
    			add_location(input0, file$2, 42, 12, 1180);
    			attr_dev(div0, "class", "pb-2 mb-2 border-b border-gray-400");
    			add_location(div0, file$2, 40, 10, 1052);
    			attr_dev(label1, "class", "address-label");
    			attr_dev(label1, "for", "phone");
    			add_location(label1, file$2, 46, 10, 1328);
    			attr_dev(input1, "class", "address-input focus:outline-none focus:border-blue-500");
    			add_location(input1, file$2, 47, 10, 1393);
    			attr_dev(label2, "class", "address-label");
    			attr_dev(label2, "for", "name");
    			add_location(label2, file$2, 50, 10, 1520);
    			attr_dev(input2, "class", "address-input focus:outline-none focus:border-blue-500");
    			add_location(input2, file$2, 51, 10, 1583);
    			attr_dev(label3, "class", "address-label");
    			attr_dev(label3, "for", "zip");
    			add_location(label3, file$2, 54, 10, 1709);
    			attr_dev(input3, "class", "address-input focus:outline-none focus:border-blue-500");
    			add_location(input3, file$2, 55, 10, 1770);
    			attr_dev(label4, "class", "address-label");
    			attr_dev(label4, "for", "city");
    			add_location(label4, file$2, 58, 10, 1895);
    			attr_dev(input4, "class", "address-input focus:outline-none focus:border-blue-500");
    			add_location(input4, file$2, 59, 10, 1958);
    			attr_dev(label5, "class", "address-label");
    			attr_dev(label5, "for", "state");
    			add_location(label5, file$2, 62, 10, 2084);
    			attr_dev(input5, "class", "address-input focus:outline-none focus:border-blue-500");
    			add_location(input5, file$2, 63, 10, 2149);
    			attr_dev(label6, "class", "address-label");
    			attr_dev(label6, "for", "address");
    			add_location(label6, file$2, 66, 10, 2276);
    			attr_dev(input6, "class", "address-input focus:outline-none focus:border-blue-500");
    			add_location(input6, file$2, 67, 10, 2345);
    			attr_dev(div1, "class", "pr-16");
    			add_location(div1, file$2, 39, 8, 1022);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div0, label0);
    			append_dev(div0, t1);
    			append_dev(div0, input0);
    			set_input_value(input0, /*$email*/ ctx[3]);
    			append_dev(div1, t2);
    			append_dev(div1, label1);
    			append_dev(div1, t4);
    			append_dev(div1, input1);
    			set_input_value(input1, /*$phone*/ ctx[4]);
    			append_dev(div1, t5);
    			append_dev(div1, label2);
    			append_dev(div1, t7);
    			append_dev(div1, input2);
    			set_input_value(input2, /*$name*/ ctx[5]);
    			append_dev(div1, t8);
    			append_dev(div1, label3);
    			append_dev(div1, t10);
    			append_dev(div1, input3);
    			set_input_value(input3, /*$zip*/ ctx[6]);
    			append_dev(div1, t11);
    			append_dev(div1, label4);
    			append_dev(div1, t13);
    			append_dev(div1, input4);
    			set_input_value(input4, /*$city*/ ctx[7]);
    			append_dev(div1, t14);
    			append_dev(div1, label5);
    			append_dev(div1, t16);
    			append_dev(div1, input5);
    			set_input_value(input5, /*$state*/ ctx[8]);
    			append_dev(div1, t17);
    			append_dev(div1, label6);
    			append_dev(div1, t19);
    			append_dev(div1, input6);
    			set_input_value(input6, /*$address*/ ctx[9]);

    			dispose = [
    				listen_dev(input0, "input", /*input0_input_handler*/ ctx[11]),
    				listen_dev(input1, "input", /*input1_input_handler*/ ctx[12]),
    				listen_dev(input2, "input", /*input2_input_handler*/ ctx[13]),
    				listen_dev(input3, "input", /*input3_input_handler*/ ctx[14]),
    				listen_dev(input4, "input", /*input4_input_handler*/ ctx[15]),
    				listen_dev(input5, "input", /*input5_input_handler*/ ctx[16]),
    				listen_dev(input6, "input", /*input6_input_handler*/ ctx[17])
    			];
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$email*/ 8 && input0.value !== /*$email*/ ctx[3]) {
    				set_input_value(input0, /*$email*/ ctx[3]);
    			}

    			if (dirty & /*$phone*/ 16 && input1.value !== /*$phone*/ ctx[4]) {
    				set_input_value(input1, /*$phone*/ ctx[4]);
    			}

    			if (dirty & /*$name*/ 32 && input2.value !== /*$name*/ ctx[5]) {
    				set_input_value(input2, /*$name*/ ctx[5]);
    			}

    			if (dirty & /*$zip*/ 64 && input3.value !== /*$zip*/ ctx[6]) {
    				set_input_value(input3, /*$zip*/ ctx[6]);
    			}

    			if (dirty & /*$city*/ 128 && input4.value !== /*$city*/ ctx[7]) {
    				set_input_value(input4, /*$city*/ ctx[7]);
    			}

    			if (dirty & /*$state*/ 256 && input5.value !== /*$state*/ ctx[8]) {
    				set_input_value(input5, /*$state*/ ctx[8]);
    			}

    			if (dirty & /*$address*/ 512 && input6.value !== /*$address*/ ctx[9]) {
    				set_input_value(input6, /*$address*/ ctx[9]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(39:6) {#if $cartStatus == 'expandCart'}",
    		ctx
    	});

    	return block;
    }

    // (107:8) {#if $displayCart.length > 0}
    function create_if_block$1(ctx) {
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let current;
    	let each_value = /*$displayCart*/ ctx[10];
    	validate_each_argument(each_value);
    	const get_key = ctx => /*product*/ ctx[22].id;
    	validate_each_keys(ctx, each_value, get_each_context, get_key);

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$displayCart*/ 1024) {
    				const each_value = /*$displayCart*/ ctx[10];
    				validate_each_argument(each_value);
    				group_outros();
    				validate_each_keys(ctx, each_value, get_each_context, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block, each_1_anchor, get_each_context);
    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(107:8) {#if $displayCart.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (108:10) {#each $displayCart as { product, quantity, total }
    function create_each_block(key_1, ctx) {
    	let li;
    	let t;
    	let li_intro;
    	let li_outro;
    	let current;

    	const cartitem = new CartItem({
    			props: {
    				product: /*product*/ ctx[22],
    				quantity: /*quantity*/ ctx[23],
    				total: /*total*/ ctx[24]
    			},
    			$$inline: true
    		});

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			li = element("li");
    			create_component(cartitem.$$.fragment);
    			t = space();
    			attr_dev(li, "class", "line-item flex py-2 w-full self-start border-b-2\n              border-gray-200");
    			add_location(li, file$2, 108, 12, 3959);
    			this.first = li;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			mount_component(cartitem, li, null);
    			append_dev(li, t);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const cartitem_changes = {};
    			if (dirty & /*$displayCart*/ 1024) cartitem_changes.product = /*product*/ ctx[22];
    			if (dirty & /*$displayCart*/ 1024) cartitem_changes.quantity = /*quantity*/ ctx[23];
    			if (dirty & /*$displayCart*/ 1024) cartitem_changes.total = /*total*/ ctx[24];
    			cartitem.$set(cartitem_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(cartitem.$$.fragment, local);

    			if (local) {
    				add_render_callback(() => {
    					if (li_outro) li_outro.end(1);
    					if (!li_intro) li_intro = create_in_transition(li, receive, {});
    					li_intro.start();
    				});
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(cartitem.$$.fragment, local);
    			if (li_intro) li_intro.invalidate();

    			if (local) {
    				li_outro = create_out_transition(li, send, {});
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			destroy_component(cartitem);
    			if (detaching && li_outro) li_outro.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(108:10) {#each $displayCart as { product, quantity, total }",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div5;
    	let div0;
    	let h1;
    	let t0;
    	let t1;
    	let a;
    	let t3;
    	let div4;
    	let div1;
    	let t4;
    	let div3;
    	let ul;
    	let t5;
    	let div2;
    	let h3;
    	let t7;
    	let span;
    	let current;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*$cartStatus*/ ctx[2] == "expandCart") return create_if_block_1;
    		if (/*$cartStatus*/ ctx[2] == "showPayment") return create_if_block_2;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block0 = current_block_type && current_block_type(ctx);
    	let if_block1 = /*$displayCart*/ ctx[10].length > 0 && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div0 = element("div");
    			h1 = element("h1");
    			t0 = text(/*cartText*/ ctx[1]);
    			t1 = space();
    			a = element("a");
    			a.textContent = "Reset";
    			t3 = space();
    			div4 = element("div");
    			div1 = element("div");
    			if (if_block0) if_block0.c();
    			t4 = space();
    			div3 = element("div");
    			ul = element("ul");
    			if (if_block1) if_block1.c();
    			t5 = space();
    			div2 = element("div");
    			h3 = element("h3");
    			h3.textContent = "Total";
    			t7 = space();
    			span = element("span");
    			span.textContent = "Cart total";
    			attr_dev(h1, "class", "flex-auto text-2xl font-black");
    			add_location(h1, file$2, 26, 4, 647);
    			attr_dev(a, "href", "#");
    			attr_dev(a, "class", "cart-reset bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold\n      py-2 px-4 rounded inline-flex items-center");
    			add_location(a, file$2, 27, 4, 709);
    			attr_dev(div0, "class", "flex py-4");
    			add_location(div0, file$2, 25, 2, 619);
    			attr_dev(div1, "class", "flex-auto");
    			add_location(div1, file$2, 37, 4, 950);
    			add_location(ul, file$2, 105, 6, 3828);
    			attr_dev(h3, "class", "flex-auto self-center uppercase font-bold");
    			add_location(h3, file$2, 121, 8, 4285);
    			attr_dev(span, "class", "text-2xl text-green-600");
    			add_location(span, file$2, 122, 8, 4358);
    			attr_dev(div2, "class", "flex w-full");
    			add_location(div2, file$2, 120, 6, 4251);
    			attr_dev(div3, "class", "line-items w-full self-start");
    			add_location(div3, file$2, 104, 4, 3779);
    			attr_dev(div4, "class", "step-container flex");
    			add_location(div4, file$2, 36, 2, 912);
    			attr_dev(div5, "class", "cart-container flex-auto p-4");
    			add_location(div5, file$2, 24, 0, 574);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div0);
    			append_dev(div0, h1);
    			append_dev(h1, t0);
    			append_dev(div0, t1);
    			append_dev(div0, a);
    			append_dev(div5, t3);
    			append_dev(div5, div4);
    			append_dev(div4, div1);
    			if (if_block0) if_block0.m(div1, null);
    			append_dev(div4, t4);
    			append_dev(div4, div3);
    			append_dev(div3, ul);
    			if (if_block1) if_block1.m(ul, null);
    			append_dev(div3, t5);
    			append_dev(div3, div2);
    			append_dev(div2, h3);
    			append_dev(div2, t7);
    			append_dev(div2, span);
    			current = true;
    			dispose = listen_dev(a, "click", reset, false, false, false);
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*cartText*/ 2) set_data_dev(t0, /*cartText*/ ctx[1]);

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if (if_block0) if_block0.d(1);
    				if_block0 = current_block_type && current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(div1, null);
    				}
    			}

    			if (/*$displayCart*/ ctx[10].length > 0) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block$1(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(ul, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);

    			if (if_block0) {
    				if_block0.d();
    			}

    			if (if_block1) if_block1.d();
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function reset() {
    	cart$1.reset();
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $cartStatus;
    	let $email;
    	let $phone;
    	let $name;
    	let $zip;
    	let $city;
    	let $state;
    	let $address;
    	let $displayCart;
    	validate_store(cartStatus$1, "cartStatus");
    	component_subscribe($$self, cartStatus$1, $$value => $$invalidate(2, $cartStatus = $$value));
    	validate_store(email, "email");
    	component_subscribe($$self, email, $$value => $$invalidate(3, $email = $$value));
    	validate_store(phone, "phone");
    	component_subscribe($$self, phone, $$value => $$invalidate(4, $phone = $$value));
    	validate_store(name, "name");
    	component_subscribe($$self, name, $$value => $$invalidate(5, $name = $$value));
    	validate_store(zip, "zip");
    	component_subscribe($$self, zip, $$value => $$invalidate(6, $zip = $$value));
    	validate_store(city, "city");
    	component_subscribe($$self, city, $$value => $$invalidate(7, $city = $$value));
    	validate_store(state, "state");
    	component_subscribe($$self, state, $$value => $$invalidate(8, $state = $$value));
    	validate_store(address, "address");
    	component_subscribe($$self, address, $$value => $$invalidate(9, $address = $$value));
    	validate_store(displayCart, "displayCart");
    	component_subscribe($$self, displayCart, $$value => $$invalidate(10, $displayCart = $$value));
    	let { cartText } = $$props;

    	let { paymentDetails = {
    		cardNumber: "",
    		cvv: "",
    		expiry: "",
    		name: ""
    	} } = $$props;

    	const writable_props = ["cartText", "paymentDetails"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<ShippingDetails> was created with unknown prop '${key}'`);
    	});

    	function input0_input_handler() {
    		$email = this.value;
    		email.set($email);
    	}

    	function input1_input_handler() {
    		$phone = this.value;
    		phone.set($phone);
    	}

    	function input2_input_handler() {
    		$name = this.value;
    		name.set($name);
    	}

    	function input3_input_handler() {
    		$zip = this.value;
    		zip.set($zip);
    	}

    	function input4_input_handler() {
    		$city = this.value;
    		city.set($city);
    	}

    	function input5_input_handler() {
    		$state = this.value;
    		state.set($state);
    	}

    	function input6_input_handler() {
    		$address = this.value;
    		address.set($address);
    	}

    	function input0_input_handler_1() {
    		paymentDetails.cardNumber = this.value;
    		$$invalidate(0, paymentDetails);
    	}

    	function input1_input_handler_1() {
    		paymentDetails.cvv = this.value;
    		$$invalidate(0, paymentDetails);
    	}

    	function input2_input_handler_1() {
    		paymentDetails.expiry = this.value;
    		$$invalidate(0, paymentDetails);
    	}

    	function input3_input_handler_1() {
    		paymentDetails.name = this.value;
    		$$invalidate(0, paymentDetails);
    	}

    	$$self.$set = $$props => {
    		if ("cartText" in $$props) $$invalidate(1, cartText = $$props.cartText);
    		if ("paymentDetails" in $$props) $$invalidate(0, paymentDetails = $$props.paymentDetails);
    	};

    	$$self.$capture_state = () => ({
    		displayCart,
    		cart: cart$1,
    		email,
    		phone,
    		name,
    		zip,
    		city,
    		state,
    		address,
    		CartItem,
    		cartStatus: cartStatus$1,
    		fade,
    		fly,
    		send,
    		receive,
    		cartText,
    		paymentDetails,
    		reset,
    		$cartStatus,
    		$email,
    		$phone,
    		$name,
    		$zip,
    		$city,
    		$state,
    		$address,
    		$displayCart
    	});

    	$$self.$inject_state = $$props => {
    		if ("cartText" in $$props) $$invalidate(1, cartText = $$props.cartText);
    		if ("paymentDetails" in $$props) $$invalidate(0, paymentDetails = $$props.paymentDetails);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		paymentDetails,
    		cartText,
    		$cartStatus,
    		$email,
    		$phone,
    		$name,
    		$zip,
    		$city,
    		$state,
    		$address,
    		$displayCart,
    		input0_input_handler,
    		input1_input_handler,
    		input2_input_handler,
    		input3_input_handler,
    		input4_input_handler,
    		input5_input_handler,
    		input6_input_handler,
    		input0_input_handler_1,
    		input1_input_handler_1,
    		input2_input_handler_1,
    		input3_input_handler_1
    	];
    }

    class ShippingDetails extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { cartText: 1, paymentDetails: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ShippingDetails",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*cartText*/ ctx[1] === undefined && !("cartText" in props)) {
    			console.warn("<ShippingDetails> was created without expected prop 'cartText'");
    		}
    	}

    	get cartText() {
    		throw new Error("<ShippingDetails>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set cartText(value) {
    		throw new Error("<ShippingDetails>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get paymentDetails() {
    		throw new Error("<ShippingDetails>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set paymentDetails(value) {
    		throw new Error("<ShippingDetails>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* svelte/Cart.svelte generated by Svelte v3.19.1 */
    const file$3 = "svelte/Cart.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[9] = list[i].product;
    	child_ctx[10] = list[i].quantity;
    	child_ctx[11] = list[i].total;
    	return child_ctx;
    }

    // (69:0) {#if $cartStatus !== 'showConfirmation'}
    function create_if_block_5(ctx) {
    	let current;

    	const shippingdetails = new ShippingDetails({
    			props: { cartText: /*cartText*/ ctx[0] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(shippingdetails.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(shippingdetails, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const shippingdetails_changes = {};
    			if (dirty & /*cartText*/ 1) shippingdetails_changes.cartText = /*cartText*/ ctx[0];
    			shippingdetails.$set(shippingdetails_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(shippingdetails.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(shippingdetails.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(shippingdetails, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(69:0) {#if $cartStatus !== 'showConfirmation'}",
    		ctx
    	});

    	return block;
    }

    // (73:0) {#if $cartStatus === 'showConfirmation'}
    function create_if_block_3(ctx) {
    	let div4;
    	let div0;
    	let h30;
    	let t1;
    	let p;
    	let t3;
    	let div3;
    	let div2;
    	let ul;
    	let t4;
    	let div1;
    	let h31;
    	let t6;
    	let span;
    	let current;
    	let if_block = /*$cart*/ ctx[2].length > 0 && create_if_block_4(ctx);

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			div0 = element("div");
    			h30 = element("h3");
    			h30.textContent = "Your order has been confirmed";
    			t1 = space();
    			p = element("p");
    			p.textContent = "R37542347";
    			t3 = space();
    			div3 = element("div");
    			div2 = element("div");
    			ul = element("ul");
    			if (if_block) if_block.c();
    			t4 = space();
    			div1 = element("div");
    			h31 = element("h3");
    			h31.textContent = "Total";
    			t6 = space();
    			span = element("span");
    			span.textContent = "Cart total";
    			attr_dev(h30, "class", "text-2xl font-bold");
    			add_location(h30, file$3, 75, 6, 1969);
    			attr_dev(p, "class", "font-bold");
    			add_location(p, file$3, 76, 6, 2041);
    			attr_dev(div0, "class", "mb-12 text-center");
    			add_location(div0, file$3, 74, 4, 1931);
    			add_location(ul, file$3, 80, 8, 2178);
    			attr_dev(h31, "class", "flex-auto self-center uppercase font-bold");
    			add_location(h31, file$3, 96, 10, 2649);
    			attr_dev(span, "class", "text-2xl text-green-600");
    			add_location(span, file$3, 97, 10, 2724);
    			attr_dev(div1, "class", "flex w-full");
    			add_location(div1, file$3, 95, 8, 2613);
    			attr_dev(div2, "class", "line-items mx-auto w-full self-start");
    			add_location(div2, file$3, 79, 6, 2119);
    			attr_dev(div3, "class", "mx-auto");
    			add_location(div3, file$3, 78, 4, 2091);
    			attr_dev(div4, "class", "confirmation-container pt-24 flex-auto p-4");
    			add_location(div4, file$3, 73, 2, 1870);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, div0);
    			append_dev(div0, h30);
    			append_dev(div0, t1);
    			append_dev(div0, p);
    			append_dev(div4, t3);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			append_dev(div2, ul);
    			if (if_block) if_block.m(ul, null);
    			append_dev(div2, t4);
    			append_dev(div2, div1);
    			append_dev(div1, h31);
    			append_dev(div1, t6);
    			append_dev(div1, span);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (/*$cart*/ ctx[2].length > 0) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block_4(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(ul, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    			if (if_block) if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(73:0) {#if $cartStatus === 'showConfirmation'}",
    		ctx
    	});

    	return block;
    }

    // (82:10) {#if $cart.length > 0}
    function create_if_block_4(ctx) {
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let current;
    	let each_value = /*$cart*/ ctx[2];
    	validate_each_argument(each_value);
    	const get_key = ctx => /*product*/ ctx[9].id;
    	validate_each_keys(ctx, each_value, get_each_context$1, get_key);

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$1(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$cart*/ 4) {
    				const each_value = /*$cart*/ ctx[2];
    				validate_each_argument(each_value);
    				group_outros();
    				validate_each_keys(ctx, each_value, get_each_context$1, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block$1, each_1_anchor, get_each_context$1);
    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(82:10) {#if $cart.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (83:12) {#each $cart as { product, quantity, total }
    function create_each_block$1(key_1, ctx) {
    	let li;
    	let t;
    	let li_intro;
    	let li_outro;
    	let current;

    	const cartitem = new CartItem({
    			props: {
    				product: /*product*/ ctx[9],
    				quantity: /*quantity*/ ctx[10],
    				total: /*total*/ ctx[11]
    			},
    			$$inline: true
    		});

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			li = element("li");
    			create_component(cartitem.$$.fragment);
    			t = space();
    			attr_dev(li, "class", "line-item flex py-2 w-full self-start border-b-2\n                border-gray-200");
    			add_location(li, file$3, 83, 14, 2301);
    			this.first = li;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			mount_component(cartitem, li, null);
    			append_dev(li, t);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const cartitem_changes = {};
    			if (dirty & /*$cart*/ 4) cartitem_changes.product = /*product*/ ctx[9];
    			if (dirty & /*$cart*/ 4) cartitem_changes.quantity = /*quantity*/ ctx[10];
    			if (dirty & /*$cart*/ 4) cartitem_changes.total = /*total*/ ctx[11];
    			cartitem.$set(cartitem_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(cartitem.$$.fragment, local);

    			if (local) {
    				add_render_callback(() => {
    					if (li_outro) li_outro.end(1);
    					if (!li_intro) li_intro = create_in_transition(li, receive, {});
    					li_intro.start();
    				});
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(cartitem.$$.fragment, local);
    			if (li_intro) li_intro.invalidate();

    			if (local) {
    				li_outro = create_out_transition(li, send, {});
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			destroy_component(cartitem);
    			if (detaching && li_outro) li_outro.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(83:12) {#each $cart as { product, quantity, total }",
    		ctx
    	});

    	return block;
    }

    // (118:39) 
    function create_if_block_2$1(ctx) {
    	let a;
    	let dispose;

    	const block = {
    		c: function create() {
    			a = element("a");
    			a.textContent = "Checkout";
    			attr_dev(a, "href", "#");
    			attr_dev(a, "class", "w-full bg-black text-white uppercase text-center p-4 self-end");
    			add_location(a, file$3, 118, 2, 3218);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			dispose = listen_dev(a, "click", /*showConfirmation*/ ctx[6], false, false, false);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$1.name,
    		type: "if",
    		source: "(118:39) ",
    		ctx
    	});

    	return block;
    }

    // (111:38) 
    function create_if_block_1$1(ctx) {
    	let a;
    	let dispose;

    	const block = {
    		c: function create() {
    			a = element("a");
    			a.textContent = "Checkout";
    			attr_dev(a, "href", "#");
    			attr_dev(a, "class", "w-full bg-black text-white uppercase text-center p-4 self-end");
    			add_location(a, file$3, 111, 2, 3038);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			dispose = listen_dev(a, "click", /*showPayment*/ ctx[5], false, false, false);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(111:38) ",
    		ctx
    	});

    	return block;
    }

    // (104:0) {#if $cartStatus == ''}
    function create_if_block$2(ctx) {
    	let a;
    	let dispose;

    	const block = {
    		c: function create() {
    			a = element("a");
    			a.textContent = "Checkout";
    			attr_dev(a, "href", "#");
    			attr_dev(a, "class", "w-full bg-black text-white uppercase text-center p-4 self-end");
    			add_location(a, file$3, 104, 2, 2860);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			dispose = listen_dev(a, "click", /*expandCart*/ ctx[4], false, false, false);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(104:0) {#if $cartStatus == ''}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let div1;
    	let div0;
    	let t0;
    	let a;
    	let t2;
    	let t3;
    	let t4;
    	let if_block2_anchor;
    	let current;
    	let dispose;
    	let if_block0 = /*$cartStatus*/ ctx[1] !== "showConfirmation" && create_if_block_5(ctx);
    	let if_block1 = /*$cartStatus*/ ctx[1] === "showConfirmation" && create_if_block_3(ctx);

    	function select_block_type(ctx, dirty) {
    		if (/*$cartStatus*/ ctx[1] == "") return create_if_block$2;
    		if (/*$cartStatus*/ ctx[1] == "expandCart") return create_if_block_1$1;
    		if (/*$cartStatus*/ ctx[1] == "showPayment") return create_if_block_2$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block2 = current_block_type && current_block_type(ctx);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			t0 = space();
    			a = element("a");
    			a.textContent = "Close";
    			t2 = space();
    			if (if_block0) if_block0.c();
    			t3 = space();
    			if (if_block1) if_block1.c();
    			t4 = space();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    			attr_dev(div0, "class", "flex-auto");
    			add_location(div0, file$3, 64, 2, 1650);
    			attr_dev(a, "href", "#");
    			attr_dev(a, "class", "hide-cart");
    			add_location(a, file$3, 65, 2, 1678);
    			attr_dev(div1, "class", "flex w-full mt-4 px-4 ");
    			add_location(div1, file$3, 63, 0, 1611);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div1, t0);
    			append_dev(div1, a);
    			insert_dev(target, t2, anchor);
    			if (if_block0) if_block0.m(target, anchor);
    			insert_dev(target, t3, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_dev(target, t4, anchor);
    			if (if_block2) if_block2.m(target, anchor);
    			insert_dev(target, if_block2_anchor, anchor);
    			current = true;
    			dispose = listen_dev(a, "click", /*hideCart*/ ctx[3], false, false, false);
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*$cartStatus*/ ctx[1] !== "showConfirmation") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_5(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(t3.parentNode, t3);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*$cartStatus*/ ctx[1] === "showConfirmation") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block_3(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(t4.parentNode, t4);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block2) {
    				if_block2.p(ctx, dirty);
    			} else {
    				if (if_block2) if_block2.d(1);
    				if_block2 = current_block_type && current_block_type(ctx);

    				if (if_block2) {
    					if_block2.c();
    					if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (detaching) detach_dev(t2);
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach_dev(t3);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach_dev(t4);

    			if (if_block2) {
    				if_block2.d(detaching);
    			}

    			if (detaching) detach_dev(if_block2_anchor);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function reset$1() {
    	displayCart.reset();
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $cartStatus;
    	let $cart;
    	validate_store(cartStatus$1, "cartStatus");
    	component_subscribe($$self, cartStatus$1, $$value => $$invalidate(1, $cartStatus = $$value));
    	validate_store(displayCart, "cart");
    	component_subscribe($$self, displayCart, $$value => $$invalidate(2, $cart = $$value));
    	const cartContainer = document.getElementById("cart");
    	const mainContainer = document.querySelector("#main-container");
    	let cartText = "Cart";

    	function hideCart() {
    		cartContainer.classList.remove("show-cart", "expand-cart", "show-shipping", "show-payment", "show-confirmation");
    		mainContainer.classList.remove("-translate-x-64");
    		$$invalidate(0, cartText = "Cart");
    		cartStatus$1.set("");
    	}

    	function expandCart() {
    		cartContainer.classList.remove("show-cart");
    		cartContainer.classList.add("expand-cart", "show-shipping");
    		mainContainer.classList.add("transition-all", "duration-500", "transform", "-translate-x-64");
    		$$invalidate(0, cartText = "Checking out as Guest");
    		cartStatus$1.set("expandCart");
    	}

    	function showPayment() {
    		$$invalidate(0, cartText = "Payment");
    		cartContainer.classList.remove("show-shipping");
    		cartContainer.classList.add("show-payment");
    		cartStatus$1.set("showPayment");
    	}

    	function showConfirmation() {
    		cartContainer.classList.remove("show-paymnent");
    		cartStatus$1.set("showConfirmation");
    	}

    	$$self.$capture_state = () => ({
    		cart: displayCart,
    		isCartRestored,
    		cartStatus: cartStatus$1,
    		CartItem,
    		ShippingDetails,
    		crossfade,
    		fade,
    		fly,
    		send,
    		receive,
    		flip,
    		quintOut,
    		cartContainer,
    		mainContainer,
    		cartText,
    		reset: reset$1,
    		hideCart,
    		expandCart,
    		showPayment,
    		showConfirmation,
    		document,
    		$cartStatus,
    		$cart
    	});

    	$$self.$inject_state = $$props => {
    		if ("cartText" in $$props) $$invalidate(0, cartText = $$props.cartText);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		cartText,
    		$cartStatus,
    		$cart,
    		hideCart,
    		expandCart,
    		showPayment,
    		showConfirmation
    	];
    }

    class Cart$1 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Cart",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    /* svelte/ShowCart.svelte generated by Svelte v3.19.1 */

    const file$4 = "svelte/ShowCart.svelte";

    function create_fragment$4(ctx) {
    	let div;
    	let a;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			a = element("a");
    			a.textContent = "View Cart";
    			attr_dev(a, "href", "#");
    			attr_dev(a, "class", "flex font-bold uppercase text-sm px-2");
    			add_location(a, file$4, 10, 2, 296);
    			attr_dev(div, "class", "absolute top-0 right-0 mt-8 mr-8 p-1 rounded-full border border-solid\n  border-black hover:bg-black hover:text-white transition-all duration-200");
    			add_location(div, file$4, 7, 0, 133);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, a);
    			dispose = listen_dev(a, "click", showCart$1, false, false, false);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function showCart$1() {
    	let cart = document.getElementById("cart");
    	cart.classList.add("show-cart");
    }

    function instance$4($$self, $$props, $$invalidate) {
    	$$self.$capture_state = () => ({ showCart: showCart$1, document });
    	return [];
    }

    class ShowCart extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ShowCart",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    const items = document.querySelectorAll(".product");
    items.forEach(item => {
      new AddToCart({
        target: item.querySelector(".product-info"),
        props: {
          product: item.dataset
        }
      });
    });

    const cart$2 = document.querySelector("#cart");
    new Cart$1({
      target: cart$2,
      props: {}
    });

    const showCart$2 = document.querySelector("#header");
    new ShowCart({
      target: showCart$2,
      props: {}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
