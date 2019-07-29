var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function is_promise(value) {
        return value && typeof value === 'object' && typeof value.then === 'function';
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

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
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
        else
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_style(node, key, value) {
        node.style.setProperty(key, value);
    }
    function select_option(select, value) {
        for (let i = 0; i < select.options.length; i += 1) {
            const option = select.options[i];
            if (option.__value === value) {
                option.selected = true;
                return;
            }
        }
    }
    function select_value(select) {
        const selected_option = select.querySelector(':checked') || select.options[0];
        return selected_option && selected_option.__value;
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
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment) {
            $$.update($$.dirty);
            run_all($$.before_update);
            $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
            $$.after_update.forEach(add_render_callback);
        }
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

    function handle_promise(promise, info) {
        const token = info.token = {};
        function update(type, index, key, value) {
            if (info.token !== token)
                return;
            info.resolved = key && { [key]: value };
            const child_ctx = assign(assign({}, info.ctx), info.resolved);
            const block = type && (info.current = type)(child_ctx);
            if (info.block) {
                if (info.blocks) {
                    info.blocks.forEach((block, i) => {
                        if (i !== index && block) {
                            group_outros();
                            transition_out(block, 1, 1, () => {
                                info.blocks[i] = null;
                            });
                            check_outros();
                        }
                    });
                }
                else {
                    info.block.d(1);
                }
                block.c();
                transition_in(block, 1);
                block.m(info.mount(), info.anchor);
                flush();
            }
            info.block = block;
            if (info.blocks)
                info.blocks[index] = block;
        }
        if (is_promise(promise)) {
            promise.then(value => {
                update(info.then, 1, info.value, value);
            }, error => {
                update(info.catch, 2, info.error, error);
            });
            // if we previously had a then/catch block, destroy it
            if (info.current !== info.pending) {
                update(info.pending, 0);
                return true;
            }
        }
        else {
            if (info.current !== info.then) {
                update(info.then, 1, info.value, promise);
                return true;
            }
            info.resolved = { [info.value]: promise };
        }
    }

    const globals = (typeof window !== 'undefined' ? window : global);
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment.m(target, anchor);
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
        if (component.$$.fragment) {
            run_all(component.$$.on_destroy);
            component.$$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            component.$$.on_destroy = component.$$.fragment = null;
            component.$$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal, prop_names) {
        const parent_component = current_component;
        set_current_component(component);
        const props = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props: prop_names,
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
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, props, (key, value) => {
                if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
            })
            : props;
        $$.update();
        ready = true;
        run_all($$.before_update);
        $$.fragment = create_fragment($$.ctx);
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment.c();
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
    }

    /* view/frontend/web/js/ShippingAddress.svelte generated by Svelte v3.6.9 */
    const { Error: Error_1 } = globals;

    const file = "view/frontend/web/js/ShippingAddress.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.method = list[i];
    	return child_ctx;
    }

    // (223:0) {:catch error}
    function create_catch_block(ctx) {
    	var p;

    	return {
    		c: function create() {
    			p = element("p");
    			p.textContent = "error loading shipping methods";
    			add_location(p, file, 223, 0, 5172);
    		},

    		m: function mount(target, anchor) {
    			insert(target, p, anchor);
    		},

    		p: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(p);
    			}
    		}
    	};
    }

    // (198:0) {:then shippingMethods}
    function create_then_block(ctx) {
    	var form, table, tbody;

    	var each_value = ctx.shippingMethods;

    	var each_blocks = [];

    	for (var i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c: function create() {
    			form = element("form");
    			table = element("table");
    			tbody = element("tbody");

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}
    			add_location(tbody, file, 200, 3, 4450);
    			attr(table, "class", "table-checkout-shipping-method");
    			add_location(table, file, 199, 2, 4399);
    			attr(form, "class", "form svelte-1byyq7");
    			add_location(form, file, 198, 1, 4376);
    		},

    		m: function mount(target, anchor) {
    			insert(target, form, anchor);
    			append(form, table);
    			append(table, tbody);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}
    		},

    		p: function update(changed, ctx) {
    			if (changed.promise || changed.selected_shipping_method) {
    				each_value = ctx.shippingMethods;

    				for (var i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(form);
    			}

    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (202:4) {#each shippingMethods as method}
    function create_each_block(ctx) {
    	var tr, td0, input, input_value_value, t0, td1, span, t1, t2_value = ctx.method.amount, t2, t3, td2, t4_value = ctx.method.method_title, t4, t5, td3, t6_value = ctx.method.carrier_title, t6, t7, dispose;

    	function click_handler(...args) {
    		return ctx.click_handler(ctx, ...args);
    	}

    	return {
    		c: function create() {
    			tr = element("tr");
    			td0 = element("td");
    			input = element("input");
    			t0 = space();
    			td1 = element("td");
    			span = element("span");
    			t1 = text("$");
    			t2 = text(t2_value);
    			t3 = space();
    			td2 = element("td");
    			t4 = text(t4_value);
    			t5 = space();
    			td3 = element("td");
    			t6 = text(t6_value);
    			t7 = space();
    			ctx.$$binding_groups[0].push(input);
    			attr(input, "class", "radio");
    			attr(input, "type", "radio");
    			attr(input, "name", "shipping_method");
    			input.__value = input_value_value = ctx.method.carrier_code + "_" + ctx.method.method_code;
    			input.value = input.__value;
    			add_location(input, file, 204, 7, 4653);
    			attr(td0, "class", "col col-method");
    			add_location(td0, file, 203, 6, 4617);
    			attr(span, "class", "price");
    			add_location(span, file, 213, 7, 4914);
    			attr(td1, "class", "col col-price");
    			add_location(td1, file, 212, 6, 4879);
    			attr(td2, "class", "col col-method");
    			add_location(td2, file, 215, 6, 4978);
    			attr(td3, "class", "col col-carrier");
    			add_location(td3, file, 216, 6, 5039);
    			attr(tr, "class", "row");
    			add_location(tr, file, 202, 5, 4503);

    			dispose = [
    				listen(input, "change", ctx.input_change_handler),
    				listen(tr, "click", click_handler)
    			];
    		},

    		m: function mount(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			append(td0, input);

    			input.checked = input.__value === ctx.selected_shipping_method;

    			append(tr, t0);
    			append(tr, td1);
    			append(td1, span);
    			append(span, t1);
    			append(span, t2);
    			append(tr, t3);
    			append(tr, td2);
    			append(td2, t4);
    			append(tr, t5);
    			append(tr, td3);
    			append(td3, t6);
    			append(tr, t7);
    		},

    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			if (changed.selected_shipping_method) input.checked = input.__value === ctx.selected_shipping_method;

    			if ((changed.promise) && input_value_value !== (input_value_value = ctx.method.carrier_code + "_" + ctx.method.method_code)) {
    				input.__value = input_value_value;
    			}

    			input.value = input.__value;

    			if ((changed.promise) && t2_value !== (t2_value = ctx.method.amount)) {
    				set_data(t2, t2_value);
    			}

    			if ((changed.promise) && t4_value !== (t4_value = ctx.method.method_title)) {
    				set_data(t4, t4_value);
    			}

    			if ((changed.promise) && t6_value !== (t6_value = ctx.method.carrier_title)) {
    				set_data(t6, t6_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(tr);
    			}

    			ctx.$$binding_groups[0].splice(ctx.$$binding_groups[0].indexOf(input), 1);
    			run_all(dispose);
    		}
    	};
    }

    // (196:16)   <p>loading...</p>  {:then shippingMethods}
    function create_pending_block(ctx) {
    	var p;

    	return {
    		c: function create() {
    			p = element("p");
    			p.textContent = "loading...";
    			add_location(p, file, 196, 0, 4331);
    		},

    		m: function mount(target, anchor) {
    			insert(target, p, anchor);
    		},

    		p: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(p);
    			}
    		}
    	};
    }

    function create_fragment(ctx) {
    	var h20, t1, form, div21, div1, label0, t3, div0, input0, t4, div3, label1, t6, div2, input1, t7, div5, label2, t9, div4, input2, t10, div7, label3, t12, div6, input3, t13, fieldset, legend, t15, div12, div9, div8, input4, t16, div11, div10, input5, t17, div14, label4, t19, div13, input6, t20, div16, label5, t22, div15, select, option0, option1, option2, option3, option4, t28, div18, label6, t30, div17, input7, t31, div20, label7, t33, div19, input8, t34, h21, t36, await_block_anchor, promise_1, dispose;

    	let info = {
    		ctx,
    		current: null,
    		token: null,
    		pending: create_pending_block,
    		then: create_then_block,
    		catch: create_catch_block,
    		value: 'shippingMethods',
    		error: 'error'
    	};

    	handle_promise(promise_1 = ctx.promise, info);

    	return {
    		c: function create() {
    			h20 = element("h2");
    			h20.textContent = "Shipping Address";
    			t1 = space();
    			form = element("form");
    			div21 = element("div");
    			div1 = element("div");
    			label0 = element("label");
    			label0.textContent = "Email Address";
    			t3 = space();
    			div0 = element("div");
    			input0 = element("input");
    			t4 = space();
    			div3 = element("div");
    			label1 = element("label");
    			label1.textContent = "First Name";
    			t6 = space();
    			div2 = element("div");
    			input1 = element("input");
    			t7 = space();
    			div5 = element("div");
    			label2 = element("label");
    			label2.textContent = "Last Name";
    			t9 = space();
    			div4 = element("div");
    			input2 = element("input");
    			t10 = space();
    			div7 = element("div");
    			label3 = element("label");
    			label3.textContent = "Company";
    			t12 = space();
    			div6 = element("div");
    			input3 = element("input");
    			t13 = space();
    			fieldset = element("fieldset");
    			legend = element("legend");
    			legend.textContent = "Street Address";
    			t15 = space();
    			div12 = element("div");
    			div9 = element("div");
    			div8 = element("div");
    			input4 = element("input");
    			t16 = space();
    			div11 = element("div");
    			div10 = element("div");
    			input5 = element("input");
    			t17 = space();
    			div14 = element("div");
    			label4 = element("label");
    			label4.textContent = "City";
    			t19 = space();
    			div13 = element("div");
    			input6 = element("input");
    			t20 = space();
    			div16 = element("div");
    			label5 = element("label");
    			label5.textContent = "State/Province";
    			t22 = space();
    			div15 = element("div");
    			select = element("select");
    			option0 = element("option");
    			option0.textContent = "Please select a region, state or province.";
    			option1 = element("option");
    			option1.textContent = "Alabama";
    			option2 = element("option");
    			option2.textContent = "Alaska";
    			option3 = element("option");
    			option3.textContent = "American Samoa";
    			option4 = element("option");
    			option4.textContent = "Arizona";
    			t28 = space();
    			div18 = element("div");
    			label6 = element("label");
    			label6.textContent = "Zip/Postal Code";
    			t30 = space();
    			div17 = element("div");
    			input7 = element("input");
    			t31 = space();
    			div20 = element("div");
    			label7 = element("label");
    			label7.textContent = "Telephone";
    			t33 = space();
    			div19 = element("div");
    			input8 = element("input");
    			t34 = space();
    			h21 = element("h2");
    			h21.textContent = "Shipping Methods";
    			t36 = space();
    			await_block_anchor = empty();

    			info.block.c();
    			attr(h20, "class", "svelte-1byyq7");
    			add_location(h20, file, 72, 0, 1338);
    			attr(label0, "class", "label");
    			add_location(label0, file, 76, 3, 1467);
    			attr(input0, "class", "input-text");
    			attr(input0, "type", "email");
    			attr(input0, "name", "username");
    			add_location(input0, file, 78, 4, 1541);
    			attr(div0, "class", "control");
    			add_location(div0, file, 77, 3, 1514);
    			attr(div1, "class", "field");
    			add_location(div1, file, 75, 2, 1443);
    			attr(label1, "class", "label");
    			add_location(label1, file, 82, 3, 1669);
    			attr(input1, "class", "input-text");
    			attr(input1, "type", "text");
    			attr(input1, "name", "firstname");
    			add_location(input1, file, 84, 4, 1740);
    			attr(div2, "class", "control");
    			add_location(div2, file, 83, 3, 1713);
    			attr(div3, "class", "field");
    			add_location(div3, file, 81, 2, 1645);
    			attr(label2, "class", "label");
    			add_location(label2, file, 94, 3, 1932);
    			attr(input2, "class", "input-text");
    			attr(input2, "type", "text");
    			attr(input2, "name", "lastname");
    			add_location(input2, file, 96, 4, 2002);
    			attr(div4, "class", "control");
    			add_location(div4, file, 95, 3, 1975);
    			attr(div5, "class", "field");
    			add_location(div5, file, 93, 2, 1908);
    			attr(label3, "class", "label");
    			add_location(label3, file, 106, 3, 2192);
    			attr(input3, "class", "input-text");
    			attr(input3, "type", "text");
    			attr(input3, "name", "company");
    			add_location(input3, file, 108, 4, 2260);
    			attr(div6, "class", "control");
    			add_location(div6, file, 107, 3, 2233);
    			attr(div7, "class", "field");
    			add_location(div7, file, 105, 2, 2168);
    			attr(legend, "class", "label");
    			add_location(legend, file, 118, 3, 2460);
    			attr(input4, "class", "input-text");
    			attr(input4, "type", "text");
    			attr(input4, "name", "street[0]");
    			add_location(input4, file, 122, 6, 2592);
    			attr(div8, "class", "control");
    			add_location(div8, file, 121, 5, 2563);
    			attr(div9, "class", "field");
    			add_location(div9, file, 120, 4, 2537);
    			attr(input5, "class", "input-text");
    			attr(input5, "type", "text");
    			attr(input5, "name", "street[1]");
    			add_location(input5, file, 133, 6, 2842);
    			attr(div10, "class", "control");
    			add_location(div10, file, 132, 5, 2813);
    			attr(div11, "class", "field additional");
    			add_location(div11, file, 131, 4, 2776);
    			attr(div12, "class", "control");
    			add_location(div12, file, 119, 3, 2510);
    			attr(fieldset, "class", "field street");
    			add_location(fieldset, file, 117, 2, 2424);
    			attr(label4, "class", "label");
    			add_location(label4, file, 145, 3, 3074);
    			attr(input6, "class", "input-text");
    			attr(input6, "type", "text");
    			attr(input6, "name", "city");
    			add_location(input6, file, 147, 4, 3139);
    			attr(div13, "class", "control");
    			add_location(div13, file, 146, 3, 3112);
    			attr(div14, "class", "field");
    			add_location(div14, file, 144, 2, 3050);
    			attr(label5, "class", "label");
    			add_location(label5, file, 157, 3, 3321);
    			option0.__value = "0";
    			option0.value = option0.__value;
    			add_location(option0, file, 165, 5, 3524);
    			option1.__value = "1";
    			option1.value = option1.__value;
    			add_location(option1, file, 166, 5, 3600);
    			option2.__value = "2";
    			option2.value = option2.__value;
    			add_location(option2, file, 167, 5, 3641);
    			option3.__value = "3";
    			option3.value = option3.__value;
    			add_location(option3, file, 168, 5, 3681);
    			option4.__value = "4";
    			option4.value = option4.__value;
    			add_location(option4, file, 169, 5, 3729);
    			if (ctx.region_id === void 0) add_render_callback(() => ctx.select_change_handler.call(select));
    			attr(select, "class", "select");
    			attr(select, "name", "region_id");
    			add_location(select, file, 159, 4, 3396);
    			attr(div15, "class", "control");
    			add_location(div15, file, 158, 3, 3369);
    			attr(div16, "class", "field");
    			add_location(div16, file, 156, 2, 3297);
    			attr(label6, "class", "label");
    			add_location(label6, file, 174, 3, 3827);
    			attr(input7, "class", "input-text");
    			attr(input7, "type", "text");
    			attr(input7, "name", "postcode");
    			add_location(input7, file, 176, 4, 3903);
    			attr(div17, "class", "control");
    			add_location(div17, file, 175, 3, 3876);
    			attr(div18, "class", "field");
    			add_location(div18, file, 173, 2, 3803);
    			attr(label7, "class", "label");
    			add_location(label7, file, 186, 3, 4093);
    			attr(input8, "class", "input-text");
    			attr(input8, "type", "text");
    			attr(input8, "name", "telephone");
    			add_location(input8, file, 188, 4, 4163);
    			attr(div19, "class", "control");
    			add_location(div19, file, 187, 3, 4136);
    			attr(div20, "class", "field");
    			add_location(div20, file, 185, 2, 4069);
    			attr(div21, "class", "fieldset address");
    			add_location(div21, file, 74, 1, 1409);
    			attr(form, "class", "form form-shipping-address svelte-1byyq7");
    			add_location(form, file, 73, 0, 1365);
    			attr(h21, "class", "svelte-1byyq7");
    			add_location(h21, file, 194, 0, 4286);

    			dispose = [
    				listen(input0, "input", ctx.input0_input_handler),
    				listen(input1, "input", ctx.input1_input_handler),
    				listen(input1, "change", ctx.onAddressChange),
    				listen(input2, "input", ctx.input2_input_handler),
    				listen(input2, "change", ctx.onAddressChange),
    				listen(input3, "input", ctx.input3_input_handler),
    				listen(input3, "change", ctx.onAddressChange),
    				listen(input4, "input", ctx.input4_input_handler),
    				listen(input4, "change", ctx.onAddressChange),
    				listen(input5, "input", ctx.input5_input_handler),
    				listen(input5, "change", ctx.onAddressChange),
    				listen(input6, "input", ctx.input6_input_handler),
    				listen(input6, "change", ctx.onAddressChange),
    				listen(select, "change", ctx.select_change_handler),
    				listen(select, "change", ctx.onAddressChange),
    				listen(input7, "input", ctx.input7_input_handler),
    				listen(input7, "change", ctx.onAddressChange),
    				listen(input8, "input", ctx.input8_input_handler)
    			];
    		},

    		l: function claim(nodes) {
    			throw new Error_1("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, h20, anchor);
    			insert(target, t1, anchor);
    			insert(target, form, anchor);
    			append(form, div21);
    			append(div21, div1);
    			append(div1, label0);
    			append(div1, t3);
    			append(div1, div0);
    			append(div0, input0);

    			input0.value = ctx.username;

    			append(div21, t4);
    			append(div21, div3);
    			append(div3, label1);
    			append(div3, t6);
    			append(div3, div2);
    			append(div2, input1);

    			input1.value = ctx.firstname;

    			append(div21, t7);
    			append(div21, div5);
    			append(div5, label2);
    			append(div5, t9);
    			append(div5, div4);
    			append(div4, input2);

    			input2.value = ctx.lastname;

    			append(div21, t10);
    			append(div21, div7);
    			append(div7, label3);
    			append(div7, t12);
    			append(div7, div6);
    			append(div6, input3);

    			input3.value = ctx.company;

    			append(div21, t13);
    			append(div21, fieldset);
    			append(fieldset, legend);
    			append(fieldset, t15);
    			append(fieldset, div12);
    			append(div12, div9);
    			append(div9, div8);
    			append(div8, input4);

    			input4.value = ctx.street0;

    			append(div12, t16);
    			append(div12, div11);
    			append(div11, div10);
    			append(div10, input5);

    			input5.value = ctx.street1;

    			append(div21, t17);
    			append(div21, div14);
    			append(div14, label4);
    			append(div14, t19);
    			append(div14, div13);
    			append(div13, input6);

    			input6.value = ctx.city;

    			append(div21, t20);
    			append(div21, div16);
    			append(div16, label5);
    			append(div16, t22);
    			append(div16, div15);
    			append(div15, select);
    			append(select, option0);
    			append(select, option1);
    			append(select, option2);
    			append(select, option3);
    			append(select, option4);

    			select_option(select, ctx.region_id);

    			append(div21, t28);
    			append(div21, div18);
    			append(div18, label6);
    			append(div18, t30);
    			append(div18, div17);
    			append(div17, input7);

    			input7.value = ctx.postcode;

    			append(div21, t31);
    			append(div21, div20);
    			append(div20, label7);
    			append(div20, t33);
    			append(div20, div19);
    			append(div19, input8);

    			input8.value = ctx.telephone;

    			insert(target, t34, anchor);
    			insert(target, h21, anchor);
    			insert(target, t36, anchor);
    			insert(target, await_block_anchor, anchor);

    			info.block.m(target, info.anchor = anchor);
    			info.mount = () => await_block_anchor.parentNode;
    			info.anchor = await_block_anchor;
    		},

    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			if (changed.username && (input0.value !== ctx.username)) input0.value = ctx.username;
    			if (changed.firstname && (input1.value !== ctx.firstname)) input1.value = ctx.firstname;
    			if (changed.lastname && (input2.value !== ctx.lastname)) input2.value = ctx.lastname;
    			if (changed.company && (input3.value !== ctx.company)) input3.value = ctx.company;
    			if (changed.street0 && (input4.value !== ctx.street0)) input4.value = ctx.street0;
    			if (changed.street1 && (input5.value !== ctx.street1)) input5.value = ctx.street1;
    			if (changed.city && (input6.value !== ctx.city)) input6.value = ctx.city;
    			if (changed.region_id) select_option(select, ctx.region_id);
    			if (changed.postcode && (input7.value !== ctx.postcode)) input7.value = ctx.postcode;
    			if (changed.telephone && (input8.value !== ctx.telephone)) input8.value = ctx.telephone;
    			info.ctx = ctx;

    			if (('promise' in changed) && promise_1 !== (promise_1 = ctx.promise) && handle_promise(promise_1, info)) ; else {
    				info.block.p(changed, assign(assign({}, ctx), info.resolved));
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(h20);
    				detach(t1);
    				detach(form);
    				detach(t34);
    				detach(h21);
    				detach(t36);
    				detach(await_block_anchor);
    			}

    			info.block.d(detaching);
    			info.token = null;
    			info = null;

    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { quoteId } = $$props;

    	let promise = [];
    	let username = '';
    	let firstname = '';
    	let lastname = '';
    	let company = '';
    	let street0 = '';
    	let street1 = '';
    	let city = '';
    	let region_id = 0;
    	let postcode = '';
    	let telephone = '';
    	let selected_shipping_method = '';

    	async function loadShippingMethods() {
    		let res = await fetch(`/rest/default/V1/guest-carts/${quoteId}/estimate-shipping-methods`, {
    			method: 'POST',
    			headers: {
    				'Content-Type': 'application/json',
    			},
    			body: JSON.stringify({
    				address: {
    					firstname, lastname, city, region_id, postcode, company,
    					street: [street0, street1],
    					country_id: 'US',
    				}
    			}),
    		});
    		let data = await res.json();

    		if (res.ok) {
    			return data;
    		} else {
    			throw new Error('Could not load shipping methods');
    		}
    	}

    	function onAddressChange() {
    		if (
    			firstname == '' ||
    			lastname == '' ||
    			street0 == '' ||
    			city == '' ||
    			region_id == 0 ||
    			postcode == ''
    		) {
    			return;
    		}

    		$$invalidate('promise', promise = loadShippingMethods());
    	}

    	onMount(() => {
    		$$invalidate('promise', promise = loadShippingMethods());
    	});

    	const writable_props = ['quoteId'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<ShippingAddress> was created with unknown prop '${key}'`);
    	});

    	const $$binding_groups = [[]];

    	function input0_input_handler() {
    		username = this.value;
    		$$invalidate('username', username);
    	}

    	function input1_input_handler() {
    		firstname = this.value;
    		$$invalidate('firstname', firstname);
    	}

    	function input2_input_handler() {
    		lastname = this.value;
    		$$invalidate('lastname', lastname);
    	}

    	function input3_input_handler() {
    		company = this.value;
    		$$invalidate('company', company);
    	}

    	function input4_input_handler() {
    		street0 = this.value;
    		$$invalidate('street0', street0);
    	}

    	function input5_input_handler() {
    		street1 = this.value;
    		$$invalidate('street1', street1);
    	}

    	function input6_input_handler() {
    		city = this.value;
    		$$invalidate('city', city);
    	}

    	function select_change_handler() {
    		region_id = select_value(this);
    		$$invalidate('region_id', region_id);
    	}

    	function input7_input_handler() {
    		postcode = this.value;
    		$$invalidate('postcode', postcode);
    	}

    	function input8_input_handler() {
    		telephone = this.value;
    		$$invalidate('telephone', telephone);
    	}

    	function input_change_handler() {
    		selected_shipping_method = this.__value;
    		$$invalidate('selected_shipping_method', selected_shipping_method);
    	}

    	function click_handler({ method }, e) {
    		const $$result = selected_shipping_method = method.carrier_code + "_" + method.method_code;
    		$$invalidate('selected_shipping_method', selected_shipping_method);
    		return $$result;
    	}

    	$$self.$set = $$props => {
    		if ('quoteId' in $$props) $$invalidate('quoteId', quoteId = $$props.quoteId);
    	};

    	return {
    		quoteId,
    		promise,
    		username,
    		firstname,
    		lastname,
    		company,
    		street0,
    		street1,
    		city,
    		region_id,
    		postcode,
    		telephone,
    		selected_shipping_method,
    		onAddressChange,
    		input0_input_handler,
    		input1_input_handler,
    		input2_input_handler,
    		input3_input_handler,
    		input4_input_handler,
    		input5_input_handler,
    		input6_input_handler,
    		select_change_handler,
    		input7_input_handler,
    		input8_input_handler,
    		input_change_handler,
    		click_handler,
    		$$binding_groups
    	};
    }

    class ShippingAddress extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, ["quoteId"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.quoteId === undefined && !('quoteId' in props)) {
    			console.warn("<ShippingAddress> was created without expected prop 'quoteId'");
    		}
    	}

    	get quoteId() {
    		throw new Error_1("<ShippingAddress>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set quoteId(value) {
    		throw new Error_1("<ShippingAddress>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* view/frontend/web/js/Payment.svelte generated by Svelte v3.6.9 */
    const { Error: Error_1$1 } = globals;

    const file$1 = "view/frontend/web/js/Payment.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.segment = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = Object.create(ctx);
    	child_ctx.method = list[i];
    	return child_ctx;
    }

    // (69:0) {:catch error}
    function create_catch_block$1(ctx) {
    	var p;

    	return {
    		c: function create() {
    			p = element("p");
    			p.textContent = "error loading shipping methods";
    			add_location(p, file$1, 69, 0, 1580);
    		},

    		m: function mount(target, anchor) {
    			insert(target, p, anchor);
    		},

    		p: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(p);
    			}
    		}
    	};
    }

    // (36:0) {:then data}
    function create_then_block$1(ctx) {
    	var form, table0, tbody0, t0, h2, t2, table1, tbody1;

    	var each_value_1 = ctx.data.payment_methods;

    	var each_blocks_1 = [];

    	for (var i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	var each_value = ctx.data.totals.total_segments;

    	var each_blocks = [];

    	for (var i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	return {
    		c: function create() {
    			form = element("form");
    			table0 = element("table");
    			tbody0 = element("tbody");

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t0 = space();
    			h2 = element("h2");
    			h2.textContent = "Summary";
    			t2 = space();
    			table1 = element("table");
    			tbody1 = element("tbody");

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}
    			add_location(tbody0, file$1, 38, 3, 789);
    			attr(table0, "class", "table-checkout-shipping-method");
    			add_location(table0, file$1, 37, 2, 738);
    			attr(form, "class", "form");
    			add_location(form, file$1, 36, 1, 715);
    			attr(h2, "class", "svelte-ild14t");
    			add_location(h2, file$1, 57, 1, 1258);
    			add_location(tbody1, file$1, 59, 2, 1344);
    			attr(table1, "class", "data table table-totals");
    			set_style(table1, "max-width", "40%");
    			add_location(table1, file$1, 58, 1, 1277);
    		},

    		m: function mount(target, anchor) {
    			insert(target, form, anchor);
    			append(form, table0);
    			append(table0, tbody0);

    			for (var i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(tbody0, null);
    			}

    			insert(target, t0, anchor);
    			insert(target, h2, anchor);
    			insert(target, t2, anchor);
    			insert(target, table1, anchor);
    			append(table1, tbody1);

    			for (var i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody1, null);
    			}
    		},

    		p: function update(changed, ctx) {
    			if (changed.promise || changed.selectedPaymentMethod) {
    				each_value_1 = ctx.data.payment_methods;

    				for (var i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(changed, child_ctx);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(tbody0, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}
    				each_blocks_1.length = each_value_1.length;
    			}

    			if (changed.promise) {
    				each_value = ctx.data.totals.total_segments;

    				for (var i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}
    				each_blocks.length = each_value.length;
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(form);
    			}

    			destroy_each(each_blocks_1, detaching);

    			if (detaching) {
    				detach(t0);
    				detach(h2);
    				detach(t2);
    				detach(table1);
    			}

    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (40:4) {#each data.payment_methods as method}
    function create_each_block_1(ctx) {
    	var tr, td0, input, input_value_value, t0, td1, t1_value = ctx.method.title, t1, t2, dispose;

    	function click_handler(...args) {
    		return ctx.click_handler(ctx, ...args);
    	}

    	return {
    		c: function create() {
    			tr = element("tr");
    			td0 = element("td");
    			input = element("input");
    			t0 = space();
    			td1 = element("td");
    			t1 = text(t1_value);
    			t2 = space();
    			ctx.$$binding_groups[0].push(input);
    			attr(input, "class", "radio");
    			attr(input, "type", "radio");
    			attr(input, "name", "shipping_method");
    			input.__value = input_value_value = ctx.method.code;
    			input.value = input.__value;
    			add_location(input, file$1, 42, 7, 959);
    			attr(td0, "class", "col col-method");
    			add_location(td0, file$1, 41, 6, 923);
    			attr(td1, "class", "col col-method");
    			add_location(td1, file$1, 50, 6, 1147);
    			attr(tr, "class", "row");
    			add_location(tr, file$1, 40, 5, 847);

    			dispose = [
    				listen(input, "change", ctx.input_change_handler),
    				listen(tr, "click", click_handler)
    			];
    		},

    		m: function mount(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			append(td0, input);

    			input.checked = input.__value === ctx.selectedPaymentMethod;

    			append(tr, t0);
    			append(tr, td1);
    			append(td1, t1);
    			append(tr, t2);
    		},

    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			if (changed.selectedPaymentMethod) input.checked = input.__value === ctx.selectedPaymentMethod;

    			if ((changed.promise) && input_value_value !== (input_value_value = ctx.method.code)) {
    				input.__value = input_value_value;
    			}

    			input.value = input.__value;

    			if ((changed.promise) && t1_value !== (t1_value = ctx.method.title)) {
    				set_data(t1, t1_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(tr);
    			}

    			ctx.$$binding_groups[0].splice(ctx.$$binding_groups[0].indexOf(input), 1);
    			run_all(dispose);
    		}
    	};
    }

    // (61:3) {#each data.totals.total_segments as segment}
    function create_each_block$1(ctx) {
    	var tr, th, t0_value = ctx.segment.title, t0, t1, td, t2_value = ctx.segment.value, t2, t3;

    	return {
    		c: function create() {
    			tr = element("tr");
    			th = element("th");
    			t0 = text(t0_value);
    			t1 = space();
    			td = element("td");
    			t2 = text(t2_value);
    			t3 = space();
    			attr(th, "class", "mark");
    			add_location(th, file$1, 62, 5, 1433);
    			attr(td, "class", "amount");
    			add_location(td, file$1, 63, 5, 1477);
    			attr(tr, "class", "totals");
    			add_location(tr, file$1, 61, 4, 1407);
    		},

    		m: function mount(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, th);
    			append(th, t0);
    			append(tr, t1);
    			append(tr, td);
    			append(td, t2);
    			append(tr, t3);
    		},

    		p: function update(changed, ctx) {
    			if ((changed.promise) && t0_value !== (t0_value = ctx.segment.title)) {
    				set_data(t0, t0_value);
    			}

    			if ((changed.promise) && t2_value !== (t2_value = ctx.segment.value)) {
    				set_data(t2, t2_value);
    			}
    		},

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(tr);
    			}
    		}
    	};
    }

    // (34:16)   <p>loading...</p>  {:then data}
    function create_pending_block$1(ctx) {
    	var p;

    	return {
    		c: function create() {
    			p = element("p");
    			p.textContent = "loading...";
    			add_location(p, file$1, 34, 0, 681);
    		},

    		m: function mount(target, anchor) {
    			insert(target, p, anchor);
    		},

    		p: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(p);
    			}
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	var h2, t_1, await_block_anchor, promise_1;

    	let info = {
    		ctx,
    		current: null,
    		token: null,
    		pending: create_pending_block$1,
    		then: create_then_block$1,
    		catch: create_catch_block$1,
    		value: 'data',
    		error: 'error'
    	};

    	handle_promise(promise_1 = ctx.promise, info);

    	return {
    		c: function create() {
    			h2 = element("h2");
    			h2.textContent = "Payment Methods";
    			t_1 = space();
    			await_block_anchor = empty();

    			info.block.c();
    			attr(h2, "class", "svelte-ild14t");
    			add_location(h2, file$1, 32, 0, 637);
    		},

    		l: function claim(nodes) {
    			throw new Error_1$1("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			insert(target, h2, anchor);
    			insert(target, t_1, anchor);
    			insert(target, await_block_anchor, anchor);

    			info.block.m(target, info.anchor = anchor);
    			info.mount = () => await_block_anchor.parentNode;
    			info.anchor = await_block_anchor;
    		},

    		p: function update(changed, new_ctx) {
    			ctx = new_ctx;
    			info.ctx = ctx;

    			if (('promise' in changed) && promise_1 !== (promise_1 = ctx.promise) && handle_promise(promise_1, info)) ; else {
    				info.block.p(changed, assign(assign({}, ctx), info.resolved));
    			}
    		},

    		i: noop,
    		o: noop,

    		d: function destroy(detaching) {
    			if (detaching) {
    				detach(h2);
    				detach(t_1);
    				detach(await_block_anchor);
    			}

    			info.block.d(detaching);
    			info.token = null;
    			info = null;
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { quoteId } = $$props;

    	let promise = { payment_methods: [], totals: { total_segments: [] } };
    	let selectedPaymentMethod = '';

    	async function loadPaymentInfo() {
    		let res = await fetch(`/rest/default/V1/guest-carts/${quoteId}/payment-information`);
    		let data = await res.json();

    		if (res.ok) {
    			return data;
    		} else {
    			throw new Error('Could not load payment information');
    		}
    	}

    	onMount(() => {
    		$$invalidate('promise', promise = loadPaymentInfo());
    	});

    	const writable_props = ['quoteId'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<Payment> was created with unknown prop '${key}'`);
    	});

    	const $$binding_groups = [[]];

    	function input_change_handler() {
    		selectedPaymentMethod = this.__value;
    		$$invalidate('selectedPaymentMethod', selectedPaymentMethod);
    	}

    	function click_handler({ method }, e) {
    		const $$result = selectedPaymentMethod = method.code;
    		$$invalidate('selectedPaymentMethod', selectedPaymentMethod);
    		return $$result;
    	}

    	$$self.$set = $$props => {
    		if ('quoteId' in $$props) $$invalidate('quoteId', quoteId = $$props.quoteId);
    	};

    	return {
    		quoteId,
    		promise,
    		selectedPaymentMethod,
    		input_change_handler,
    		click_handler,
    		$$binding_groups
    	};
    }

    class Payment extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, ["quoteId"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.quoteId === undefined && !('quoteId' in props)) {
    			console.warn("<Payment> was created without expected prop 'quoteId'");
    		}
    	}

    	get quoteId() {
    		throw new Error_1$1("<Payment>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set quoteId(value) {
    		throw new Error_1$1("<Payment>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* view/frontend/web/js/App.svelte generated by Svelte v3.6.9 */

    function create_fragment$2(ctx) {
    	var t, current;

    	var shippingaddress = new ShippingAddress({
    		props: { quoteId: ctx.quoteId },
    		$$inline: true
    	});

    	var payment = new Payment({
    		props: { quoteId: ctx.quoteId },
    		$$inline: true
    	});

    	return {
    		c: function create() {
    			shippingaddress.$$.fragment.c();
    			t = space();
    			payment.$$.fragment.c();
    		},

    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},

    		m: function mount(target, anchor) {
    			mount_component(shippingaddress, target, anchor);
    			insert(target, t, anchor);
    			mount_component(payment, target, anchor);
    			current = true;
    		},

    		p: function update(changed, ctx) {
    			var shippingaddress_changes = {};
    			if (changed.quoteId) shippingaddress_changes.quoteId = ctx.quoteId;
    			shippingaddress.$set(shippingaddress_changes);

    			var payment_changes = {};
    			if (changed.quoteId) payment_changes.quoteId = ctx.quoteId;
    			payment.$set(payment_changes);
    		},

    		i: function intro(local) {
    			if (current) return;
    			transition_in(shippingaddress.$$.fragment, local);

    			transition_in(payment.$$.fragment, local);

    			current = true;
    		},

    		o: function outro(local) {
    			transition_out(shippingaddress.$$.fragment, local);
    			transition_out(payment.$$.fragment, local);
    			current = false;
    		},

    		d: function destroy(detaching) {
    			destroy_component(shippingaddress, detaching);

    			if (detaching) {
    				detach(t);
    			}

    			destroy_component(payment, detaching);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { quoteId } = $$props;

    	const writable_props = ['quoteId'];
    	Object.keys($$props).forEach(key => {
    		if (!writable_props.includes(key) && !key.startsWith('$$')) console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ('quoteId' in $$props) $$invalidate('quoteId', quoteId = $$props.quoteId);
    	};

    	return { quoteId };
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, ["quoteId"]);

    		const { ctx } = this.$$;
    		const props = options.props || {};
    		if (ctx.quoteId === undefined && !('quoteId' in props)) {
    			console.warn("<App> was created without expected prop 'quoteId'");
    		}
    	}

    	get quoteId() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set quoteId(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const el = document.querySelector('#rapidcheckout-app');
    const quoteId = el.dataset.quoteId;

    const app = new App({
    	target: el,
    	props: {
    		quoteId
    	}
    });

    return app;

}());
