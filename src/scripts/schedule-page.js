import {getInspector} from './business-inspector';
import {businessConfirm,closeBusinessDialog} from './business-dialog';
import {applyBusinessPermissions,mayOperate} from './business-permissions';
function initialize(){

      const root=document.querySelector('[data-inspector-name]');if(!root||root.dataset.scheduleReady)return;root.dataset.scheduleReady='true';
      const {clientRows,clientCategories,actorRole,requestedRow,delayThresholdMs}=JSON.parse(document.querySelector('#schedule-page-config').textContent);
      const rows = clientRows;
      const categories = clientCategories;
      const dialog = document.querySelector('#schedule-dialog');
      const form = document.querySelector('#schedule-form');
      const title = document.querySelector('#dialog-title');
      const context = document.querySelector('#dialog-context');
      const version = document.querySelector('.dialog-version');
      const revisionOnly = document.querySelector('[data-revision-only]');
      const sourcePreview = document.querySelector('[data-source-preview]');
      const promotionHelp = document.querySelector('[data-promotion-help]');
      const promotionPreview = document.querySelector('[data-promotion-preview]');
      const usageChangeField = document.querySelector('.usage-change-field');
      const categoryHelp = document.querySelector('[data-category-help]');
      const categoryRequired = document.querySelector('[data-category-required]');
      const message = document.querySelector('.form-message');
      const submitButton = form.querySelector('button[type="submit"]');
      const inspector = document.querySelector('[data-inspector]');
      inspector.addEventListener('business:promotion-state-updated',event=>{
        const {id,label,status}=event.detail;const record=rows.find(row=>row.id===id);if(record){record.promotionLabel=label;record.promotionStatus=status;}
        if(inspector.dataset.selectedId===id)inspector.querySelector('[data-inspector-promotion]').textContent=label;
        for(const node of document.querySelectorAll(`.schedule-row[data-inspect-id="${id}"] td:nth-child(4)>small`))node.textContent=label;
      });
      const inspectorEdit = document.querySelector('[data-inspector-edit]');
      const inspectorRevise = document.querySelector('[data-inspector-revise]');
      const inspectorDerived = document.querySelector('[data-inspector-derived]');
      const inspectorPublication = document.querySelector('[data-inspector-publication]');
      const inspectorDelete = document.querySelector('[data-inspector-delete]');
      const inspectorDeleteError = document.querySelector('[data-inspector-delete-error]');
      const publicationDialog = document.querySelector('#publication-dialog');
      
      const publicationForm = document.querySelector('#publication-form');
      let dirty = false;
      let mode = 'new';
      let activeRecord;
      let publicationDirty=false,detailScroll=0,priorFocus=null,leaving,viewGeneration=0;
      const sheet=document.querySelector('#schedule-panel');
      const pageLife=new AbortController();
      pageLife.signal.addEventListener('abort',()=>delete document.documentElement.dataset.schedulePanelOpen);
      document.addEventListener('astro:before-swap',()=>pageLife.abort(),{once:true});
      const isView=name=>sheet.open&&sheet.dataset.view===name;
      const panelDirty=()=>dirty||publicationDirty||inspector.dataset.dirty==='true';
      const markClean=()=>{dirty=false;publicationDirty=false;form.dataset.dirty='false';publicationForm.dataset.dirty='false';inspector.dataset.dirty='false';inspector.querySelectorAll('form[data-dirty]').forEach(f=>f.dataset.dirty='false');document.documentElement.dataset.unsaved=String(!!document.querySelector('form[data-dirty=true]'));};
      async function mayLeavePanel(){
        if(!panelDirty())return true;
        if(leaving)return leaving;
        leaving=businessConfirm('有尚未保存的修改，是否放弃？').then(accepted=>{if(accepted)markClean();return accepted;}).finally(()=>leaving=undefined);
        return leaving;
      }
      function showView(name,resume=true){
        viewGeneration++;
        if(sheet.dataset.view==='detail')detailScroll=inspector.querySelector('[data-inspector-body],.inspector-body')?.scrollTop??0;
        if(!sheet.open||sheet.dataset.closing==='true'){if(!sheet.open)priorFocus=document.activeElement;sheet.showModal();document.documentElement.dataset.schedulePanelOpen='true';}
        sheet.dataset.view=name;
        inspector.hidden=name!=='detail';dialog.hidden=name!=='form';publicationDialog.hidden=name!=='publication';
        sheet.setAttribute('aria-labelledby',name==='detail'?'schedule-detail-title':name==='form'?'dialog-title':'publication-title');
        const target=name==='detail'?inspector:name==='form'?dialog:publicationDialog;
        target.querySelector('footer')?.prepend(result);
        if(!matchMedia('(prefers-reduced-motion:reduce)').matches)target.animate([{opacity:.6},{opacity:1}],{duration:120,easing:'ease-out'});
        document.dispatchEvent(new CustomEvent('business:schedule-panel-view',{detail:{view:name,id:activeRecord?.id}}));
        if(name==='detail'){const body=inspector.querySelector('[data-inspector-body],.inspector-body');if(body)body.scrollTop=detailScroll;if(resume)document.dispatchEvent(new CustomEvent('business:schedule-detail-resumed'));}
      }
      const controller=getInspector(inspector,{
        render:id=>fillInspector(rows.find(row=>row.id===id)),
        isDirty:panelDirty,canLeave:mayLeavePanel,
        surface:{open:()=>showView('detail',false),close:async()=>{await closeBusinessDialog(sheet);if(!sheet.open)delete document.documentElement.dataset.schedulePanelOpen;}},
      });
      async function closePanel(){
        if(!await mayLeavePanel())return;
        viewGeneration++;
        if(controller.selected)controller.close();
        else{await closeBusinessDialog(sheet);if(!sheet.open)delete document.documentElement.dataset.schedulePanelOpen;priorFocus?.isConnected&&priorFocus.focus({preventScroll:true});}
      }
      async function returnToDetail(){if(!await mayLeavePanel())return;if(!activeRecord){await closePanel();return;}showView('detail');inspector.querySelector('[data-inspector-edit]')?.focus({preventScroll:true});}
      sheet.addEventListener('cancel',event=>{event.preventDefault();void closePanel();});
      sheet.addEventListener('click',event=>{if(event.target===sheet){const r=sheet.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)void closePanel();}});
      sheet.addEventListener('close',()=>{delete document.documentElement.dataset.schedulePanelOpen;});
      const result=document.createElement('div');result.className='schedule-save-result';result.hidden=true;result.setAttribute('role','status');
      const resultText=document.createElement('span'),retry=document.createElement('button');retry.type='button';retry.className='business-action-secondary';retry.textContent='重试读取';result.append(resultText,retry);
      let savedTarget=null;
      retry.addEventListener('click',async()=>{if(retry.dataset.reload==='true'){if(!document.querySelector('form[data-dirty=true]')||await businessConfirm('刷新将放弃当前页面未保存的修改，是否继续？')){document.documentElement.dataset.unsaved='false';location.reload();}}else if(savedTarget)void finishSaved(savedTarget,controller.selected!==savedTarget.id||!sheet.open);});
      async function finishSaved(target,preserveView=false){
        const originatingView=viewGeneration;
        savedTarget=target;markClean();result.hidden=false;resultText.textContent='已保存，正在更新展示…';retry.hidden=true;delete retry.dataset.reload;retry.textContent='重试读取';
        form.querySelector('[type=submit]').disabled=true;publicationForm.querySelector('[type=submit]').disabled=true;form.querySelector('.sheet-body').inert=true;publicationForm.querySelector('.sheet-body').inert=true;
        try{
          await refreshRange();
          let record=rows.find(row=>row.id===target.id);
          if(!record&&target.id){
            const url=new URL(location.href);url.searchParams.set('month',target.month);for(const key of ['status','promotion','row'])url.searchParams.delete(key);url.searchParams.set('view','schedule');
            const response=await fetch(url,{headers:{Accept:'text/html'},cache:'no-store',signal:pageLife.signal});if(!response.ok)throw Error();
            const fresh=new DOMParser().parseFromString(await response.text(),'text/html'),config=JSON.parse(fresh.querySelector('#schedule-page-config').textContent);record=config.clientRows.find(row=>row.id===target.id);if(record)rows.push(record);
          }
          resultText.textContent=target.pending?'已提交审核，生效前保留原安排。':'已保存';savedTarget=null;
          if(!sheet.open||preserveView||originatingView!==viewGeneration){const selected=rows.find(row=>row.id===controller.selected);if(selected&&sheet.dataset.view==='detail')fillInspector(selected);return;}
          if(record){activeRecord=record;if(controller.selected===record.id)fillInspector(record);controller.open(record.id,document.querySelector('[data-inspect-id="'+CSS.escape(record.id)+'"]')??document.querySelector('[data-open-new]'));inspector.focus({preventScroll:true});}
          else await closePanel();
        }catch(error){if(pageLife.signal.aborted)return;resultText.textContent=error.code==='MONTH_STAGE_CHANGED'?'已保存，本月核对阶段已变化，请刷新页面。':'已保存，展示更新失败。请重试读取。';retry.hidden=false;if(error.code==='MONTH_STAGE_CHANGED'){retry.dataset.reload='true';retry.textContent='刷新页面';}}
        finally{form.querySelector('[type=submit]').disabled=!!savedTarget;publicationForm.querySelector('[type=submit]').disabled=!!savedTarget;form.querySelector('.sheet-body').inert=!!savedTarget;publicationForm.querySelector('.sheet-body').inert=!!savedTarget;}
      }
      async function refreshRange(){
        const position={x:scrollX,y:scrollY},url=new URL(location.href);url.searchParams.delete('row');
        const response=await fetch(url,{headers:{Accept:'text/html'},cache:'no-store',signal:pageLife.signal});if(!response.ok)throw Error('读取失败');
        const fresh=new DOMParser().parseFromString(await response.text(),'text/html'),config=JSON.parse(fresh.querySelector('#schedule-page-config').textContent);
        const planData=fresh.querySelector('[data-monthly-calendar-plan]'),calendarPlan=planData?JSON.parse(planData.textContent):null;
        const panel=document.querySelector('[data-arrangement-stage]'),next=fresh.querySelector('[data-arrangement-stage]');
        if(panel&&next&&panel.dataset.arrangementStage!==next.dataset.arrangementStage)throw Object.assign(Error('本月阶段已变化'),{code:'MONTH_STAGE_CHANGED'});
        rows.splice(0,rows.length,...config.clientRows);
        const permissionData=fresh.querySelector('#business-permissions');if(permissionData){document.querySelector('#business-permissions').textContent=permissionData.textContent;}
        for(const selector of ['.status-strip','.workflow-queue-nav','.arrangement-content','.arrangement-heading','[data-arrangement-details]']){
          const current=document.querySelector(selector),other=fresh.querySelector(selector);
          if(current&&other){
            const expanded=[...current.querySelectorAll('[data-schedule-comparison-row] details[open]')].map(node=>node.closest('[data-schedule-comparison-row]').dataset.scheduleComparisonRow);
            current.replaceChildren(...other.childNodes);
            for(const id of expanded){const disclosure=current.querySelector('[data-schedule-comparison-row="'+CSS.escape(id)+'"] details');if(disclosure)disclosure.open=true;}
          }
        }
        if(!panel){const current=document.querySelector('.content-stage'),other=fresh.querySelector('.content-stage');if(current&&other)current.replaceChildren(...other.childNodes);}
        const oldForm=document.querySelector('[data-arrangement-form]'),newForm=fresh.querySelector('[data-arrangement-form]');
        if(oldForm&&newForm){oldForm.dataset.fingerprint=newForm.dataset.fingerprint;oldForm.dataset.planId=newForm.dataset.planId;}
        for(const node of document.querySelectorAll('[data-arrangement-count],[data-arrangement-planned]')){
          const key=node.hasAttribute('data-arrangement-count')?'data-arrangement-count':'data-arrangement-planned',other=fresh.querySelector('['+key+']');if(other)node.textContent=other.textContent;
        }
        const records=document.querySelector('[data-schedule-records]');if(records)records.textContent=JSON.stringify(rows);
        document.dispatchEvent(new CustomEvent('business:schedule-range-updated',{detail:{rows,plan:calendarPlan}}));
        bindRange();applyBusinessPermissions();window.scrollTo(position.x,position.y);
      }


      const field = (name) => form.elements.namedItem(name);
      const configureDateTime = (control, configuration) => control.closest('[data-datetime-field]').dispatchEvent(new CustomEvent('business:datetime-configure',{bubbles:true,detail:configuration}));
      const setInspectorText = (selector, value) => {
        const node = inspector.querySelector(selector);
        if (node) node.textContent = value || '—';
      };
      const fillInspector = (record) => {
        if (!record) return;
        activeRecord = record;
        inspector.querySelector('.inspector-actions').dataset.collaborationResource=`schedule:${record.id}`;
        inspector.querySelector('.inspector-actions').dataset.collaborationLabel=record.contentName;
        inspector.dataset.selectedId = record.id;
        setInspectorText('[data-inspector-version]', `V${record.versionNumber}`);
        setInspectorText('[data-inspector-kind]', record.workType === 'revision' ? '改帖' : '新做帖');
        setInspectorText('[data-inspector-category]', record.categoryName ? `${record.subjectName} / ${record.categoryName}` : record.subjectName);
        setInspectorText('[data-inspector-name]', record.contentName);
        setInspectorText('[data-inspector-promotion]', record.promotionLabel);
        setInspectorText('[data-inspector-planned]', record.plannedDisplay);
        setInspectorText('[data-inspector-actual]', record.actualDisplay);
        setInspectorText('[data-inspector-completion]', record.actualPublishAt?record.completionLabel:record.publicationLabel);
        setInspectorText('[data-inspector-delay-label]',record.delayLabel);inspector.querySelector('[data-inspector-delay-label]').hidden=!record.delayLabel;
        inspector.querySelector('[data-inspector-completion-row]').hidden=false;
        setInspectorText('[data-inspector-revision-summary]', record.revisionSummary);
        const revisionSection = inspector.querySelector('[data-inspector-revision-section]');
        revisionSection.hidden = record.workType !== 'revision';
        const path = inspector.querySelector('[data-inspector-path]');
        path.replaceChildren();
        const versions = record.sourceVersionNumber == null
          ? [`V${record.versionNumber}`]
          : [`V${record.sourceVersionNumber}`, `V${record.versionNumber}`];
        if (record.childVersionNumber != null) versions.push(`V${record.childVersionNumber}`);
        versions.forEach((label, index) => {
          const chip = document.createElement('span');
          chip.textContent = label;
          path.append(chip);
          if (index < versions.length - 1) path.append(document.createTextNode('→'));
        });
        inspectorRevise.dataset.businessEligible=String(!!record.actualPublishAt&&record.childVersionNumber==null);
        inspectorRevise.hidden = inspectorRevise.dataset.businessEligible!=='true'||!mayOperate('schedule.revise');
        inspectorEdit.disabled=!mayOperate('schedule.edit')&&!mayOperate('schedule.reschedule')&&!mayOperate('schedule.overdueReschedule');
        inspectorDerived.hidden = record.childVersionNumber == null;
        inspectorDerived.textContent = record.childVersionNumber == null ? '' : `已派生 V${record.childVersionNumber}`;
        inspectorPublication.textContent = record.actualPublishAt ? '查看／编辑发布登记' : '发布登记';
        inspectorPublication.dataset.businessOperation=record.actualPublishAt?'schedule.publish schedule.correctPublication':'schedule.publish';
        inspectorPublication.hidden=!mayOperate('schedule.publish')&&!(record.actualPublishAt&&mayOperate('schedule.correctPublication'));
        inspectorDeleteError.textContent = '';document.querySelector('[data-inspector-cancel-reason]').value='';
        document.dispatchEvent(new CustomEvent('business:schedule-selected', { detail: record }));
      };
      const openInspector = record => {
        if (!record) return;
        const trigger = document.querySelector(`[data-inspect-id="${CSS.escape(record.id)}"]`);
        if (!inspector.dataset.inspectorReady) inspector.dataset.selectedId = record.id;
        inspector.dispatchEvent(new CustomEvent('business:inspector-select', {detail:{id:record.id,trigger}}));
      };
      const updatePromotionPreview = () => {
        const promoted = field('isPromoted').checked;
        const actual = mode === 'edit' ? activeRecord?.actualPublishAt : null;
        promotionPreview.hidden = !(mode === 'edit' && promoted && activeRecord?.isPromoted && actual);
        const changingToNonPromotion = mode === 'edit' && activeRecord?.isPromoted && !promoted;
        usageChangeField.hidden = !changingToNonPromotion;
        field('usageChangeReason').required = changingToNonPromotion;
        if (!promoted) {
          field('promotionStatus').value = 'none';
          promotionPreview.textContent = '非推广';
          return;
        }
        if (!actual) {
          field('promotionStatus').value = 'pending';
          promotionPreview.textContent = '待推广 · 尚未登记';
          return;
        }
        if (
          mode === 'new'
          || mode === 'revision'
          || !activeRecord?.actualPublishAt
          || !activeRecord?.isPromoted
        ) {
          field('promotionStatus').value = 'awaiting_promotion';
          promotionPreview.textContent = '待开始推广 · 实发后在每日复盘确认测试';
          return;
        }
        field('promotionStatus').value = activeRecord.promotionStatus;
        promotionPreview.textContent = activeRecord.promotionLabel;
      };
      const clearErrors = () => {
        message.textContent = '';
        form.querySelectorAll('[data-error]').forEach((node) => node.textContent = '');
        form.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
      };
      const updateCategoryOptions = (selectedValue = '') => {
        const subjectId = field('subjectId').value;
        const categorySelect = field('categoryId');
        const matching = categories.filter((category) => category.subjectId === subjectId);
        categorySelect.replaceChildren();
        const prompt = document.createElement('option');
        prompt.value = '';
        prompt.textContent = matching.length ? '请选择帖子分类' : '请先选择学科';
        categorySelect.append(prompt);
        matching.forEach((category) => {
          const option = document.createElement('option');
          option.value = category.id;
          option.textContent = category.name;
          categorySelect.append(option);
        });
        categorySelect.disabled = matching.length === 0;
        categorySelect.required = matching.length > 0;
        categoryRequired.hidden = matching.length === 0;
        categoryHelp.textContent = '';
        categorySelect.value = matching.some((category) => category.id === selectedValue) ? selectedValue : '';
      };
      const setRecordValues = (record) => {
        field('subjectId').value = record.subjectId ?? '';
        updateCategoryOptions(record.categoryId ?? '');
        for (const [name, value] of Object.entries(record)) {
          const control = form.elements.namedItem(name);
          if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = Boolean(value);
          else if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) control.value = String(value ?? '');
        }
      };
      const openForm = async (nextMode, record, selectedDate = '') => {
        if(savedTarget){await finishSaved(savedTarget,true);if(savedTarget)return;}record=rows.find(row=>row.id===record?.id)??record;if(!await mayLeavePanel())return;
        if(nextMode==='revision'&&(!record?.actualPublishAt||record.childVersionNumber!=null))return;
        result.hidden=true;
        const carry=nextMode==='new'?document.querySelector('[data-monthly-plan-pool]')?.dataset.scheduleId:null;
        if(carry){const original=rows.find(r=>r.id===carry);if(original){nextMode='edit';record=original;}}
        if(nextMode==='new'&&!mayOperate('schedule.create')||nextMode==='revision'&&!mayOperate('schedule.revise'))return;
        form.querySelectorAll('[data-permission-preserved]').forEach(node=>node.remove());
        form.querySelectorAll('input,select,textarea').forEach(control=>{control.disabled=false;control.readOnly=false;});
        form.reset();
        clearErrors();
        mode = nextMode; form.dataset.scheduleMode=nextMode; applyPlanChange=false;
        if(record)activeRecord = record;else if(nextMode==='new')activeRecord=undefined;
        revisionOnly.hidden = nextMode !== 'revision';
        sourcePreview.hidden = nextMode !== 'revision';
        field('promotionStatus').disabled = false;
        promotionHelp.textContent = '';
        updateCategoryOptions();

        if(record){form.dataset.collaborationResource=`schedule:${record.id}`;form.dataset.collaborationLabel=record.contentName;}else{delete form.dataset.collaborationResource;delete form.dataset.collaborationLabel;}
        if (nextMode === 'new') {
          title.textContent = '新做帖';
          context.textContent = '新建内容';
          version.textContent = 'V0';
          submitButton.textContent = '保存新做帖';
          field('promotionStatus').value = 'none';
          field('isPromoted').checked = false;
        } else if (nextMode === 'edit') {
          title.textContent = '编辑排期';
          context.textContent = '排期详情';
          version.textContent = `V${record.versionNumber}`;
          submitButton.textContent = '保存排期';
          setRecordValues(record);
          field('recordId').value = record.id;
        } else {
          title.textContent = '创建改帖';
          context.textContent = '创建改帖';
          version.textContent = `V${record.versionNumber} → V${record.nextVersionNumber}`;
          submitButton.textContent = `创建 V${record.nextVersionNumber}`;
          setRecordValues(record);
          field('sourceScheduleId').value = record.id;
          field('plannedPublishAt').value = '';
          field('promotionStatus').value = 'pending';
          field('promotionStatus').disabled = true;
          promotionHelp.textContent = '改帖将以“待推广”开始。';
          const closing = record.promotionStatus === 'testing' ? '测试淘汰' : record.promotionStatus === 'scaling' ? '放量淘汰' : '保持当前状态';
          sourcePreview.replaceChildren();
          const sourceTitle = document.createElement('strong');
          const sourceStatus = document.createElement('span');
          sourceTitle.textContent = `来源 V${record.versionNumber} · ${record.contentName}`;
          sourceStatus.textContent = `保存后来源版本：${closing}`;
          sourcePreview.append(sourceTitle, sourceStatus);
        }
        configureDateTime(field('plannedPublishAt'),{value:field('plannedPublishAt').value,readOnly:false});
        if(selectedDate)configureDateTime(field('plannedPublishAt'),{value:`${selectedDate}T${field('plannedPublishAt').value.split('T')[1]||'09:00'}`});
        field('expectedPlanRevision').value = record?.planRevision ?? '';field('expectedWriteVersion').value=record?.writeVersion??'';
        const planReason = document.querySelector('[data-plan-change-reason]');
        planReason.hidden = true; field('planChangeReason').required = false;
        updatePromotionPreview();
        if(nextMode==='edit'){
          const overdue=!record.actualPublishAt&&Date.now()-new Date(`${record.plannedPublishAt}:00+08:00`).getTime()>=delayThresholdMs;
          configureDateTime(field('plannedPublishAt'),{readOnly:!mayOperate(overdue?'schedule.overdueReschedule':'schedule.reschedule')});
          if(!mayOperate('schedule.edit'))for(const name of ['contentName','subjectId','categoryId','projectDocUrl','isPromoted','syncToMoments','contentRole','operationType','reviewDueOn','reviewDay7','reviewDay15']){
            const control=field(name);
            if(control.tagName==='SELECT'||control.type==='checkbox'){
              control.disabled=true;if(control.type!=='checkbox'||control.checked){const preserved=document.createElement('input');preserved.type='hidden';preserved.name=name;preserved.value=control.type==='checkbox'?'on':control.value;preserved.dataset.permissionPreserved='';form.append(preserved);}
            }else control.readOnly=true;
          }
        }
        dirty = false;
        showView('form');document.dispatchEvent(new CustomEvent('business:schedule-form-opened',{detail:{mode:nextMode,record,selectedDate}}));
        field('contentName').focus({preventScroll:true});
      };
      const switchMonthlyOriginal = async event => {
        const detail=event.detail,original=rows.find(row=>row.id===detail.scheduleId);if(!original)return;
        const hasNewPostInput=field('contentName').value.trim()||field('contentRole').value||field('projectDocUrl').value.trim()||field('syncToMoments').checked||form.dataset.operationTouched==='true';
        if(dirty&&hasNewPostInput&&!await window.businessConfirm('将切换到原帖改期，当前新建输入尚未保存。',{title:'使用遗留排期',confirmLabel:'切换原排期',cancelLabel:'继续新建'})){detail.cancel();return;}
        const chosenTime=mode==='new'&&dirty?field('plannedPublishAt').value:'';
        dirty=false;document.documentElement.dataset.unsaved='false';await openForm('edit',original,detail.date);
        if(chosenTime)configureDateTime(field('plannedPublishAt'),{value:detail.date+'T'+chosenTime.split('T')[1]});form.dispatchEvent(new Event('input',{bubbles:true}));
      };
      document.addEventListener('business:monthly-schedule-switch',switchMonthlyOriginal,{signal:pageLife.signal});
      document.addEventListener('astro:before-swap',()=>document.removeEventListener('business:monthly-schedule-switch',switchMonthlyOriginal),{once:true});
      const closeForm = event => {void (event?.currentTarget.closest('header')?closePanel():returnToDetail());};
      document.querySelector('[data-open-new]')?.addEventListener('click', () => openForm('new'));
      function bindRange(){
        for(const node of document.querySelectorAll('[data-calendar-day],[data-inspect-id],[data-calendar-new]')){
          if(node.dataset.scheduleBound)continue;node.dataset.scheduleBound='true';if(node.hasAttribute('data-inspect-id')){node.setAttribute('aria-haspopup','dialog');if(!node.hasAttribute('aria-expanded'))node.setAttribute('aria-expanded','false');}
          node.addEventListener('click',event=>{
            const target=event.target.closest('[data-inspect-id],[data-calendar-new]');
            if(target&&target!==node)return;
            if(node.hasAttribute('data-inspect-id')){event.stopPropagation();openInspector(rows.find(row=>row.id===node.dataset.inspectId));}
            else if(node.hasAttribute('data-calendar-new')){event.stopPropagation();void openForm('new',undefined,node.dataset.calendarNew);}
            else if(!event.target.closest('button,a')&&(mayOperate('schedule.create')||document.querySelector('[data-monthly-plan-pool]')?.dataset.scheduleId))void openForm('new',undefined,node.dataset.calendarDay);
          });
          if(node.hasAttribute('data-inspect-id'))node.addEventListener('keydown',event=>{if(event.target===node&&['Enter',' '].includes(event.key)){event.preventDefault();openInspector(rows.find(row=>row.id===node.dataset.inspectId));}});
        }
      }
      bindRange();
      document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',closeForm));
      inspectorDelete?.addEventListener('click', async () => {
        const record = activeRecord;
        const error = inspectorDeleteError;
        const reason=document.querySelector('[data-inspector-cancel-reason]').value.trim();
        if(!reason){error.textContent='请填写取消排期的原因。';return;}
        if (!record || inspectorDelete.disabled || !await window.businessConfirm(`确定取消“${record.contentName}”的排期吗？帖子内容和历史会保留。`,{title:'取消排期',confirmLabel:'确认取消',cancelLabel:'继续查看'})) return;
        if(activeRecord?.id!==record.id)return;
        inspectorDelete.disabled=true;
        if (error) error.textContent = '';
        try {
          const response = await fetch(`/api/operations-content/${record.id}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json','Content-Type':'application/json' },body:JSON.stringify({reason}),
          });
          const result = await response.json();
          if (response.ok) {await finishSaved({id:null,month:record.plannedPublishAt.slice(0,7)});return;}
          if (error) error.textContent = result.message ?? '删除失败，请重试。';
        } catch {
          if (error) error.textContent = '无法连接服务，请稍后重试。';
        } finally {
          inspectorDelete.disabled=false;
        }
      });
      const publicationControl = (name) => publicationForm.elements.namedItem(name);
      const publicationStatus = document.querySelector('[data-publication-status]');
      const publicationMessage = document.querySelector('[data-publication-message]');
      const updatePublicationStatus = () => {
        const planned = publicationControl('plannedPublishAt').value;
        const actual = publicationControl('actualPublishAt').value;
        const delayed = Boolean(planned && actual) && new Date(`${actual}:00+08:00`).getTime() - new Date(`${planned}:00+08:00`).getTime() >= delayThresholdMs;
        publicationStatus.value = actual ? delayed ? '延期发布' : '按时发布' : '待登记';
        publicationStatus.className = `status-preview ${delayed ? 'completion-delayed' : ''}`;
      };
      const updatePublicationFields = () => {
        const requiresMomentsConfirmation=Boolean(activeRecord?.syncToMoments&&!activeRecord?.actualPublishAt);
        const moments=publicationForm.querySelector('[data-publication-moments]');moments.hidden=!requiresMomentsConfirmation;
        for(const name of ['momentsSentConfirmed','momentsRequestSentConfirmed']){const control=publicationControl(name);control.disabled=!requiresMomentsConfirmation;control.required=requiresMomentsConfirmation;}
        if(!requiresMomentsConfirmation||publicationControl('momentsSentConfirmed').checked&&publicationControl('momentsRequestSentConfirmed').checked)publicationForm.querySelector('[data-publication-moments-error]').textContent='';
        const correcting=Boolean(activeRecord?.actualPublishAt)&&mayOperate('schedule.correctPublication')&&publicationControl('correctTime').checked;
        const actual=publicationControl('actualPublishAt');configureDateTime(actual,{disabled:Boolean(activeRecord?.actualPublishAt)&&!correcting,required:!activeRecord?.actualPublishAt||correcting});
        const keepEmpty=Boolean(activeRecord?.allowEmptyPublicationLink)&&actual.value<'2026-10-17T00:00';
        publicationControl('publicationUrl').required=!keepEmpty;
        document.querySelector('[data-publication-link-required]').hidden=keepEmpty;
        publicationControl('projectDocUrl').required=!activeRecord?.actualPublishAt;
        document.querySelector('[data-publication-doc-required]').hidden=Boolean(activeRecord?.actualPublishAt);
        document.querySelector('[data-time-correction]').hidden=!correcting;
        publicationControl('correctionReason').disabled=!correcting;publicationControl('correctionReason').required=correcting;
        document.querySelector('[data-correction-toggle]').hidden=!activeRecord?.actualPublishAt||!mayOperate('schedule.correctPublication');
        updatePublicationStatus();
      };
      const openPublication = async (record) => {
        if(savedTarget){await finishSaved(savedTarget,true);if(savedTarget)return;}record=rows.find(row=>row.id===record?.id)??record;if (!record||!await mayLeavePanel()) return;
        result.hidden=true;
        activeRecord=record;publicationForm.dataset.collaborationResource=`schedule:${record.id}`;publicationForm.dataset.collaborationLabel=record.contentName;publicationForm.reset();publicationDirty=false;publicationForm.querySelector('[data-publication-moments-error]').textContent='';
        publicationControl('publicationUrl').setCustomValidity('');
        document.querySelector('[data-publication-link-preview]').textContent='';
        publicationMessage.textContent='';document.querySelectorAll('[data-publication-error]').forEach(node=>node.textContent='');
        document.querySelector('#publication-title').textContent=record.actualPublishAt?'查看／编辑发布登记':'发布登记';
        document.querySelector('[data-publication-name]').textContent=record.contentName;
        document.querySelector('[data-publication-planned]').textContent=`应发 ${record.plannedDisplay}`;
        publicationControl('plannedPublishAt').value=record.plannedPublishAt;
        configureDateTime(publicationControl('actualPublishAt'),{value:record.actualPublishAt||''});
        publicationControl('projectDocUrl').value=record.projectDocUrl||'';publicationControl('publicationUrl').value=record.publicationUrl||'';
        publicationControl('expectedWriteVersion').value=record.writeVersion;publicationControl('expectedPlanRevision').value=record.planRevision;publicationControl('expectedPublicationRevision').value=record.publicationRevision;
        updatePublicationFields();showView('publication');
        publicationControl(record.actualPublishAt?'publicationUrl':'actualPublishDate').focus({preventScroll:true});
        document.dispatchEvent(new CustomEvent('business:publication-opened',{detail:record}));
      };
      const refreshReclaimed=event=>event.detail.waitUntil((async()=>{
        if(event.target!==form&&event.target!==publicationForm)return;
        const response=await fetch(location.href,{cache:'no-store',headers:{Accept:'text/html'}});if(!response.ok)throw new Error('读取最新排期失败，请重试。');
        const fresh=new DOMParser().parseFromString(await response.text(),'text/html');const record=JSON.parse(fresh.querySelector('[data-schedule-records]').textContent).find(row=>row.id===activeRecord?.id);if(!record)throw new Error('记录已变化，请重新打开。');
        if((dirty||publicationDirty)&&(record.planRevision!==activeRecord.planRevision||record.publicationRevision!==activeRecord.publicationRevision))throw new Error('排期已有新的保存内容，当前输入已保留。请核对后重新打开该记录。');
        Object.assign(activeRecord,record);if(event.target===form&&!dirty)setRecordValues(activeRecord);
        if(event.target===publicationForm&&!publicationDirty){publicationControl('expectedPlanRevision').value=record.planRevision;publicationControl('expectedPublicationRevision').value=record.publicationRevision;publicationControl('publicationUrl').value=record.publicationUrl||'';configureDateTime(publicationControl('actualPublishAt'),{value:record.actualPublishAt||''});publicationControl('projectDocUrl').value=record.projectDocUrl||'';updatePublicationFields();}
      })());
      form.addEventListener('business:edit-reclaimed',refreshReclaimed);publicationForm.addEventListener('business:edit-reclaimed',refreshReclaimed);
      inspectorPublication?.addEventListener('click', () => openPublication(activeRecord));
      document.querySelectorAll('[data-close-publication]').forEach(button=>button.addEventListener('click',event=>{void (event.currentTarget.closest('header')?closePanel():returnToDetail());}));
      publicationForm.addEventListener('input',()=>{publicationDirty=true;document.documentElement.dataset.unsaved='true';updatePublicationFields();});
      publicationControl('correctTime').addEventListener('change',updatePublicationFields);
      publicationForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if(savedTarget)return;
        publicationMessage.textContent='正在保存发布登记…';
        const submit = publicationForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        const body = new FormData(publicationForm);
        try {
          let response = await fetch(`/api/operations-content/${activeRecord.id}/publication`, { method: 'PATCH', body, headers: { Accept: 'application/json' } });
          let result = await response.json();
          if (response.status === 409 && result.resetRequired) {
            const impact = result.impact ?? {};
            if (await window.businessConfirm(`更正实发时间会重置 ${impact.startPlans ?? 0} 个首次待定安排、${impact.campaigns ?? 0} 个推广活动和 ${impact.dailyMetrics ?? 0} 条日度指标。原记录归档保留，相关日期将重新开放补录。`,{title:'确认历史影响',confirmLabel:'确认更正'})) {
              body.set('confirmPromotionReset', '1');
              response = await fetch(`/api/operations-content/${activeRecord.id}/publication`, { method: 'PATCH', body, headers: { Accept: 'application/json' } });
              result = await response.json();
            }
          }
          if (response.ok) {await finishSaved({id:activeRecord.id,month:publicationControl('plannedPublishAt').value.slice(0,7),pending:response.status===202});return;}
          publicationMessage.textContent = result.message ?? '保存失败，请重试。';
          for (const [name, errors] of Object.entries(result.fields ?? {})) {
            const error = publicationForm.querySelector(`[data-publication-error="${name}"]`);
            if (error) error.textContent = errors[0] ?? '';
          }
        } catch { publicationMessage.textContent = '无法连接服务，请稍后重试。'; }
        finally { submit.disabled = !!savedTarget; }
      });
      inspectorEdit?.addEventListener('click', () => openForm('edit', activeRecord));
      inspectorRevise?.addEventListener('click', () => openForm('revision', activeRecord));
      form.addEventListener('input', () => {
        dirty = true; document.documentElement.dataset.unsaved = 'true'; updatePromotionPreview();
      });
      field('subjectId').addEventListener('change', () => updateCategoryOptions());
      let applyPlanChange = false;
      const formSubmitLabel=()=>mode==='new'?'保存新做帖':mode==='revision'?`创建 V${activeRecord?.nextVersionNumber}`:'保存排期';
      form.addEventListener('input',()=>{applyPlanChange=false;submitButton.textContent=formSubmitLabel();});
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if(savedTarget)return;
        clearErrors();

        if(!form.reportValidity())return;
        submitButton.disabled = true;
        submitButton.textContent = '正在保存…';
        if (mode === 'revision') field('promotionStatus').disabled = false;
        const body = new FormData(form);
        if (mode === 'revision') field('promotionStatus').disabled = true;
        const applicationSubmission = mode === 'edit' && actorRole === 'employee' && applyPlanChange;
        if(applicationSubmission){body.set('reason',field('planChangeReason').value);}
        const endpoint = applicationSubmission ? `/api/operations-content/${activeRecord.id}/change-requests` : mode === 'edit'
          ? `/api/operations-content/${activeRecord.id}`
          : mode === 'revision'
            ? `/api/operations-content/versions/${activeRecord.versionId}/revisions`
            : '/api/operations-content';
        try {
          let response = await fetch(endpoint, {
            method: applicationSubmission ? 'POST' : mode === 'edit' ? 'PATCH' : 'POST',
            body,
            headers: { Accept: 'application/json' },
          });
          let result = await response.json();
          if (response.status === 409 && result.resetRequired) {
            const impact = result.impact ?? {};
            const confirmed = await window.businessConfirm(
              result.preserveHistory
                ? `改为非推广会结束仍开放的推广阶段。${impact.campaigns ?? 0} 个推广活动和 ${impact.dailyMetrics ?? 0} 条日度数据都会保留，转为持续复盘，按需添加截止日期，已有非推广结果保留。确定继续吗？`
                : `修改实发日期会归档 ${impact.campaigns ?? 0} 个推广活动和 ${impact.dailyMetrics ?? 0} 条日度数据，并重置 ${impact.startPlans ?? 0} 个首次待定安排。确定继续吗？`,
              {title:'确认历史影响',confirmLabel:'确认更正'},
            );
            if (confirmed) {
              body.set('confirmPromotionReset', '1');
              response = await fetch(endpoint, {
                method: 'PATCH',
                body,
                headers: { Accept: 'application/json' },
              });
              result = await response.json();
            }
          }
          if(response.status===202){await finishSaved({id:activeRecord?.id,month:field('plannedPublishAt').value.slice(0,7),pending:true});return;}
          if (result.approvalRequired) { applyPlanChange=true;message.textContent=result.message;return; }
          if (response.ok && applicationSubmission) {
            applyPlanChange=false;
            configureDateTime(field('plannedPublishAt'),{value:activeRecord.plannedPublishAt});
            body.set('plannedPublishAt',activeRecord.plannedPublishAt);body.delete('reason');body.delete('planChangeReason');
            response=await fetch(`/api/operations-content/${activeRecord.id}`,{method:'PATCH',body,headers:{Accept:'application/json'}});
            result=await response.json();
            if(!response.ok){message.textContent='改期申请已提交，其他修改尚未保存：'+(result.message??'请重试。');return;}
          }
          if (response.ok) {await finishSaved({id:result.id??activeRecord?.id,month:field('plannedPublishAt').value.slice(0,7)});return;}
          if(result.code==='MONTHLY_PLAN_SOURCE_REQUIRED')form.dispatchEvent(new Event('business:monthly-source-required'));
          if(result.code==='SCHEDULE_REASON_REQUIRED'){form.dataset.reasonRequired='true';document.querySelector('[data-schedule-change-reason]').hidden=false;field('changeReason').required=true;field('changeReason').focus();}
          message.textContent = result.message ?? '保存失败，请重试。';
          for (const [name, errors] of Object.entries(result.fields ?? {})) {
            const error = form.querySelector(`[data-error="${name}"]`);
            const control = form.elements.namedItem(name);
            if (error) error.textContent = errors[0] ?? '';
            if (control instanceof HTMLElement) control.setAttribute('aria-invalid', 'true');
          }
          form.querySelector('[aria-invalid="true"]')?.focus();
        } catch {
          message.textContent = '无法连接服务，请稍后重试。';
        } finally {
          submitButton.disabled = !!savedTarget;
          submitButton.textContent = applyPlanChange ? '提交改期申请' : formSubmitLabel();
        }
      });
      document.addEventListener('business:publication-context',event=>{
        const data=event.detail,record=rows.find(row=>row.id===data.schedule.id);if(!record||isView('publication'))return;
        const asInput=value=>value?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)).replace(' ','T'):'';
        record.publicationRevision=data.schedule.publicationRevision;record.publicationUrl=data.schedule.publicationUrl;
        record.planRevision=data.schedule.planRevision;record.plannedPublishAt=asInput(data.schedule.plannedPublishAt);record.plannedDisplay=window.businessDateTime(data.schedule.plannedPublishAt);
        record.publicationState=data.publicationState;record.publicationLabel=data.publicationLabel;
        record.requiresPlanApproval=data.requiresPlanApproval;record.delayThresholdHours=data.schedule.delayThresholdHours;record.completionLabel=data.completionLabel;record.delayLabel=data.delayLabel;
        record.actualPublishAt=asInput(data.schedule.actualPublishAt);record.allowEmptyPublicationLink=data.allowEmptyPublicationLink;
        record.actualDisplay=data.schedule.actualPublishAt?window.businessDateTime(data.schedule.actualPublishAt):'—';
        if(activeRecord?.id===record.id){inspectorRevise.dataset.businessEligible=String(!!record.actualPublishAt&&record.childVersionNumber==null);applyBusinessPermissions(inspector);setInspectorText('[data-inspector-planned]',record.plannedDisplay);setInspectorText('[data-inspector-actual]',record.actualDisplay);inspectorPublication.textContent=record.actualPublishAt?'查看／编辑发布登记':'发布登记';}
      },{signal:pageLife.signal});
      document.addEventListener('business:schedule-execution-saved',event=>{
        if(!activeRecord||event.detail.id!==activeRecord.id)return;
        if(event.detail.preserveInputs)void refreshRange().then(()=>{const next=rows.find(r=>r.id===activeRecord.id);if(next)Object.assign(activeRecord,next);}).catch(()=>{result.hidden=false;resultText.textContent='已保存，列表更新失败。请稍后更新核对清单。';retry.hidden=true;});
        else void finishSaved({id:activeRecord.id,month:activeRecord.plannedPublishAt.slice(0,7),pending:event.detail.pending});
      },{signal:pageLife.signal});
      const initialRecord = rows.find(row => row.id === (requestedRow || location.hash.slice(1)));
      if (initialRecord) openInspector(initialRecord);
    
}
initialize();document.addEventListener('astro:page-load',initialize);
