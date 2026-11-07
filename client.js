window.__ModuleLoader__.load({
  id: 'dsh-worklog',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    /** Settings namespace == the plugin's Loader entry id. */
    const NS = 'dsh-worklog';

    const CSS = [
      '.wlg-wrap{width:100%;max-width:720px;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary,rgba(20,20,20,.9))}',
      '.wlg-head{display:flex;flex-direction:column;gap:4px}',
      '.wlg-title{font-size:16px;font-weight:600;line-height:24px;margin:0}',
      '.wlg-sub{font-size:13px;line-height:20px;margin:0;color:var(--dsw-alias-label-tertiary,rgba(120,120,120,.9))}',
      '.wlg-card{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.05));border-radius:10px;overflow:hidden}',
      '.wlg-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 14px;min-height:46px;box-sizing:border-box}',
      '.wlg-row+.wlg-row{border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3))}',
      '.wlg-rowText{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}',
      '.wlg-label{font-size:13px;font-weight:600;line-height:20px}',
      '.wlg-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,rgba(120,120,120,.9))}',
      '.wlg-control{display:flex;align-items:center;gap:8px;flex:none}',
      '.wlg-input{width:260px;max-width:46vw;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.03));color:var(--dsw-alias-label-primary,rgba(20,20,20,.9));border-radius:8px;padding:6px 9px;font-size:13px;font-family:inherit}',
      '.wlg-input:disabled{opacity:.5}',
      '.wlg-select{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.03));color:var(--dsw-alias-label-primary,rgba(20,20,20,.9));border-radius:8px;padding:5px 8px;font-size:13px;font-family:inherit}',
      '.wlg-btn{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));background:transparent;color:var(--dsw-alias-label-primary,rgba(20,20,20,.9));border-radius:8px;padding:5px 12px;font-size:13px;font-family:inherit;cursor:pointer}',
      '.wlg-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.1))}',
      '.wlg-btn:disabled{opacity:.45;cursor:default}',
      '.wlg-switch{flex:none;position:relative;width:34px;height:20px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.45));background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.2));cursor:pointer;padding:0;transition:background .15s ease}',
      '.wlg-switch.on{background:var(--dsw-alias-state-business-primary,#3b82f6);border-color:transparent}',
      '.wlg-switch:disabled{opacity:.45;cursor:default}',
      '.wlg-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .15s ease}',
      '.wlg-switch.on .wlg-knob{left:16px}',
      '.wlg-foot{display:flex;align-items:center;gap:10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,rgba(120,120,120,.9))}',
      '.wlg-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}',
      '.wlg-bad{color:var(--dsw-alias-state-error-primary,#d84a4a)}',
    ].join('');

    const COPY = {
      zh: {
        nav: '工作台账',
        title: '工作台账',
        sub: '从会话日志还原你每天真正做了什么，按工作目录分组写成日报、周报、月报。',
        dirLabel: '台账存放目录',
        dirHint: '留空用默认目录；支持 ~ 开头的路径，例如 ~/Documents/台账',
        dirDefault: '默认：用户目录下的 .dsh/worklog',
        reset: '恢复默认',
        mergeLabel: '跨天合流',
        mergeHint: '周报 / 月报里，同一会话跨天时合并成一行并标注「跨 N 天」',
        productsLabel: '产物清单',
        productsHint: '在台账末尾附「产物」：改动最多的文件、新生成的文档、关键命令',
        autoLabel: '自动生成周报',
        autoHint: '到点生成上一周的周报；只在本应用运行时生效，错过的时刻不会补跑',
        whenLabel: '生成时间',
        whenHint: '每周几、几点生成',
        weekdays: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
        saved: '已保存',
        failed: '保存失败，请重试',
        readonly: '这份配置当前只读，无法在这里修改',
        unavailable: '设置服务尚未就绪，稍后再打开这一页',
        foot: '改动立即生效，无需重启。命令行里也可以用',
        generate: '现在生成今天',
      },
      en: {
        nav: 'Worklog',
        title: 'Worklog',
        sub: 'Rebuilds what you actually did each day from session logs, grouped by working directory, as daily, weekly, and monthly reports.',
        dirLabel: 'Ledger folder',
        dirHint: 'Leave empty for the default folder; a ~ prefix works, e.g. ~/Documents/worklog',
        dirDefault: 'Default: .dsh/worklog in your home folder',
        reset: 'Reset',
        mergeLabel: 'Merge cross-day sessions',
        mergeHint: 'In weekly / monthly reports, one row per session with a "crossed N days" note',
        productsLabel: 'Products section',
        productsHint: 'Append the most-changed files, new documents, and key commands',
        autoLabel: 'Auto weekly report',
        autoHint: 'Writes last week\'s report on schedule; only while the app is running, missed runs are not caught up',
        whenLabel: 'Schedule',
        whenHint: 'Which weekday and time',
        weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        saved: 'Saved',
        failed: 'Save failed, try again',
        readonly: 'This configuration is read-only right now',
        unavailable: 'The settings service is not ready yet; reopen this page shortly',
        foot: 'Changes apply immediately, no restart needed. In the command line you can also use',
        generate: 'Generate today',
      },
    };

    let styleTag = null;
    function ensureCss() {
      if (styleTag || typeof document === 'undefined') return;
      styleTag = document.createElement('style');
      styleTag.setAttribute('data-plugin-css', NS);
      styleTag.textContent = CSS;
      document.head.appendChild(styleTag);
    }

    /* ---------- settings form binding ---------- */

    const FALLBACK = { status: 'idle', writable: true, revision: undefined, value: {} };

    function useForm(ctx) {
      const form = React.useMemo(() => {
        const svc = ctx.configForms;
        if (!svc || typeof svc.get !== 'function') return undefined;
        return svc.get(NS);
      }, [ctx]);

      const [snap, setSnap] = React.useState(() => (form ? form.getSnapshot() : FALLBACK));
      React.useEffect(() => {
        if (!form) return undefined;
        setSnap(form.getSnapshot());
        return form.subscribe(() => setSnap(form.getSnapshot()));
      }, [form]);
      return { form, snap };
    }

    function Switch(props) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': props.checked ? 'true' : 'false',
          'aria-label': props.label,
          className: 'wlg-switch' + (props.checked ? ' on' : ''),
          disabled: !!props.disabled,
          onClick: () => props.onChange(!props.checked),
        },
        h('span', { className: 'wlg-knob' }),
      );
    }

    function Row(props) {
      return h(
        'div',
        { className: 'wlg-row' },
        h(
          'div',
          { className: 'wlg-rowText' },
          h('div', { className: 'wlg-label' }, props.label),
          props.hint ? h('div', { className: 'wlg-hint' }, props.hint) : null,
        ),
        h('div', { className: 'wlg-control' }, props.children),
      );
    }

    function WorklogSettings(props) {
      ensureCss();
      const { ctx, t } = props;
      const { form, snap } = useForm(ctx);
      const value = snap && snap.value && typeof snap.value === 'object' ? snap.value : {};
      const auto = value.autoWeekly && typeof value.autoWeekly === 'object' ? value.autoWeekly : {};
      const storedDir = typeof value.outputDir === 'string' ? value.outputDir : '';
      const [dirText, setDirText] = React.useState(storedDir);
      const [flash, setFlash] = React.useState('');

      React.useEffect(() => {
        setDirText(storedDir);
      }, [storedDir]);

      React.useEffect(() => {
        if (!flash) return undefined;
        const timer = setTimeout(() => setFlash(''), 2200);
        return () => clearTimeout(timer);
      }, [flash]);

      const ready = snap.status === 'ready';
      const writable = snap.writable !== false;
      const disabled = !ready || !writable;
      const weekday = Number.isInteger(auto.weekday) ? auto.weekday : 7;
      const time = typeof auto.time === 'string' ? auto.time : '22:00';

      async function write(ops) {
        if (!form) return;
        const ok = await form.mutate(ops, snap.revision);
        setFlash(ok ? 'saved' : 'failed');
      }

      function commitDir() {
        const next = dirText.trim();
        if (next === storedDir) return;
        void write([{ op: 'set', path: ['outputDir'], value: next }]);
      }

      function patchAuto(patch) {
        const next = Object.assign({}, auto, patch);
        void write([
          { op: 'set', path: ['autoWeekly', 'enabled'], value: !!next.enabled },
          { op: 'set', path: ['autoWeekly', 'weekday'], value: next.weekday },
          { op: 'set', path: ['autoWeekly', 'time'], value: next.time },
        ]);
      }

      const head = h(
        'div',
        { className: 'wlg-head' },
        h('h2', { className: 'wlg-title' }, t('title')),
        h('p', { className: 'wlg-sub' }, t('sub')),
      );

      if (!ready) {
        return h(
          'div',
          { className: 'wlg-wrap' },
          head,
          h(
            'div',
            { className: 'wlg-card' },
            h(
              'div',
              { className: 'wlg-row' },
              h(
                'div',
                { className: 'wlg-rowText' },
                h(
                  'div',
                  { className: 'wlg-hint' },
                  snap.status === 'unavailable' ? t('unavailable') : t('unavailable'),
                ),
              ),
            ),
          ),
        );
      }

      return h(
        'div',
        { className: 'wlg-wrap' },
        head,

        h(
          'div',
          { className: 'wlg-card' },
          h(
            Row,
            { label: t('dirLabel'), hint: storedDir ? t('dirHint') : t('dirDefault') },
            h('input', {
              className: 'wlg-input',
              type: 'text',
              value: dirText,
              spellCheck: false,
              placeholder: t('dirDefault'),
              disabled,
              onChange: (event) => setDirText(event.currentTarget.value),
              onBlur: commitDir,
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              },
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'wlg-btn',
                disabled: disabled || storedDir === '',
                onClick: () => {
                  setDirText('');
                  void write([{ op: 'set', path: ['outputDir'], value: '' }]);
                },
              },
              t('reset'),
            ),
          ),
        ),

        h(
          'div',
          { className: 'wlg-card' },
          h(
            Row,
            { label: t('mergeLabel'), hint: t('mergeHint') },
            h(Switch, {
              checked: value.mergeCrossDay !== false,
              disabled,
              label: t('mergeLabel'),
              onChange: (next) => void write([{ op: 'set', path: ['mergeCrossDay'], value: next }]),
            }),
          ),
          h(
            Row,
            { label: t('productsLabel'), hint: t('productsHint') },
            h(Switch, {
              checked: value.products !== false,
              disabled,
              label: t('productsLabel'),
              onChange: (next) => void write([{ op: 'set', path: ['products'], value: next }]),
            }),
          ),
        ),

        h(
          'div',
          { className: 'wlg-card' },
          h(
            Row,
            { label: t('autoLabel'), hint: t('autoHint') },
            h(Switch, {
              checked: auto.enabled === true,
              disabled,
              label: t('autoLabel'),
              onChange: (next) => patchAuto({ enabled: next }),
            }),
          ),
          h(
            Row,
            { label: t('whenLabel'), hint: t('whenHint') },
            h(
              'select',
              {
                className: 'wlg-select',
                value: String(weekday),
                disabled: disabled || auto.enabled !== true,
                'aria-label': t('whenLabel'),
                onChange: (event) => patchAuto({ weekday: Number(event.currentTarget.value) }),
              },
              t('weekdays').map((name, index) =>
                h('option', { key: index, value: String(index + 1) }, name),
              ),
            ),
            h('input', {
              className: 'wlg-input',
              style: { width: '110px' },
              type: 'time',
              value: time,
              disabled: disabled || auto.enabled !== true,
              'aria-label': t('whenLabel'),
              onChange: (event) => {
                const next = event.currentTarget.value;
                if (next) patchAuto({ time: next });
              },
            }),
          ),
        ),

        h(
          'div',
          { className: 'wlg-foot' },
          h('span', null, t('foot')),
          h('span', { className: 'wlg-code' }, '/worklog 今天'),
          h('span', { className: 'wlg-code' }, '/worklog 本周'),
          h('span', { className: 'wlg-code' }, '/worklog 设置'),
          flash
            ? h(
                'span',
                { className: flash === 'failed' ? 'wlg-bad' : null },
                flash === 'failed' ? t('failed') : t('saved'),
              )
            : null,
          writable ? null : h('span', { className: 'wlg-bad' }, t('readonly')),
        ),
      );
    }

    return {
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        const disposers = [
          ctx.locale.register(NS, 'zh', COPY.zh),
          ctx.locale.register(NS, 'en', COPY.en),
        ];
        const t = ctx.locale.bind(NS);

        if (typeof ctx.effect === 'function') {
          ctx.effect(() => () => {
            for (const dispose of disposers) dispose();
          });
        }

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: NS,
              order: 50,
              label: () => t('nav'),
              locale: NS,
              inject: () => ({ t }),
            },
            () => h(WorklogSettings, { ctx, t }),
          ),
        );
      },
    };
  },
});
