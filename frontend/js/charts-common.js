/** Cấu hình mặc định cho biểu đồ Chart.js dùng chung nhiều trang */
function chartBaseOptions(opts){
  opts = opts || {};
  return {
    responsive:true, maintainAspectRatio:false,
    interaction:{ mode:'index', intersect:false },
    plugins:{
      legend:{ display: !!opts.legend, position:'top', align:'end', labels:{ usePointStyle:true, boxWidth:8, font:{ family:'Manrope', weight:'700', size:11.5 }, color:'#636b8c' } },
      tooltip:{ backgroundColor:'#1b2036', padding:10, cornerRadius:10, titleFont:{weight:'700'}, callbacks:{ label:(ctx)=> `${ctx.dataset.label||''}: ${formatVND(ctx.raw)}`.replace(/^: /,'') } },
    },
    scales: opts.noScales ? {} : {
      x:{ grid:{ display:false }, ticks:{ color:'#8891ad', font:{ size:11, weight:'600' } } },
      y:{ display: !!opts.yTicks, grid:{ color:'#eef1f8' }, ticks:{ color:'#8891ad', font:{ size:11 }, callback:(v)=>formatCompact(v) } },
    }
  };
}
