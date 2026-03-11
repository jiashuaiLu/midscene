const joyTest = new JoyTest(page, agent, platform, {
  executionId: params?.executionId ?? 1,
  stopOnStepFailure: params.stopOnStepFailure ?? 1,
  deviceId: params?.deviceId
});

try {
  await joyTest.preTest();
  
  await agent.setAIActionContext('如果弹窗遮挡了操作元素,优先关闭弹窗;');
  
  await joyTest.runTest(async () => {
    
    // 等待4秒
    await joyTest.executeStep("等待4秒", async () => {
      await sleep(4000);
    }, 102762);
    
    // 断言页面加载完成
    await joyTest.executeAssert("页面加载完成", "UI", async () => {
      await agent.aiAssert("页面加载完成", "页面未加载完成");
      return true;
    }, 102762);
    
    // 如果左侧菜单栏没有展开,点击左下角icon,展开菜单栏,如果已经展开继续下一步
    await joyTest.executeStep(`如果左侧菜单栏没有展开,点击左下角icon,展开菜单栏,如果已经展开继续下一步`, async () => {
      const isExpanded = await agent.aiBoolean('左侧菜单栏是否已展开');
      if (!isExpanded) {
        await agent.aiTap("左下角icon");
      }
    }, 102763);
    
    // 断言展开左侧菜单栏
    await joyTest.executeAssert("展开左侧菜单栏", "UI", async () => {
      await agent.aiAssert("左侧菜单栏已展开", "左侧菜单栏未展开");
      return true;
    }, 102763);
    
    // 点击常用右边的设置icon
    await joyTest.executeStep("点击常用右边的设置icon", async () => {
      await agent.aiTap("常用右边的设置icon");
    }, 102764);
    
    // 断言常用设置弹窗已打开
    await joyTest.executeAssert("常用设置弹窗已打开", "UI", async () => {
      await agent.aiAssert("常用设置弹窗已打开", "常用设置弹窗未打开");
      return true;
    }, 102764);
    
    // 依次点击常用菜单项后面的"-"icon,直到清空所有菜单项
    await joyTest.executeStep(`依次点击常用菜单项后面的"-"icon,直到清空所有菜单项`, async () => {
      const items = await agent.aiQuery('string[], 常用菜单项列表');
      for (const item of items) {
        await agent.aiTap(`${item}后面的"-"icon`);
      }
    }, 102765);
    
    // 断言常用菜单里无菜单项
    await joyTest.executeAssert("常用菜单里无菜单项", "UI", async () => {
      await agent.aiAssert("常用菜单里无菜单项", "常用菜单里仍有菜单项");
      return true;
    }, 102765);
    
    // 点击下方商品Tab
    await joyTest.executeStep("点击下方商品Tab", async () => {
      await agent.aiTap("下方商品Tab");
    }, 102766);
    
    // 断言成功切换到商品Tab
    await joyTest.executeAssert("成功切换到商品Tab", "UI", async () => {
      await agent.aiAssert("成功切换到商品Tab", "未成功切换到商品Tab");
      return true;
    }, 102766);
    
    // 点击商品列表菜单项后的+号icon
    await joyTest.executeStep("点击商品列表菜单项后的+号icon", async () => {
      await agent.aiTap("商品列表菜单项后的+号icon");
    }, 102767);
    
    // 断言商品列表菜单项成功添加到常用菜单中
    await joyTest.executeAssert("商品列表菜单项成功添加到常用菜单中", "UI", async () => {
      await agent.aiAssert("商品列表菜单项成功添加到常用菜单中", "商品列表菜单项未成功添加到常用菜单中");
      return true;
    }, 102767);
    
    // 点击库存Tab
    await joyTest.executeStep("点击库存Tab", async () => {
      await agent.aiTap("库存Tab");
    }, 102768);
    
    // 断言成功切换到库存Tab
    await joyTest.executeAssert("成功切换到库存Tab", "UI", async () => {
      await agent.aiAssert("成功切换到库存Tab", "未成功切换到库存Tab");
      return true;
    }, 102768);
    
    // 点击库存管理菜单项后的+号icon
    await joyTest.executeStep("点击库存管理菜单项后的+号icon", async () => {
      await agent.aiTap("库存管理菜单项后的+号icon");
    }, 102769);
    
    // 断言库存管理成功添加到常用菜单中
    await joyTest.executeAssert("库存管理成功添加到常用菜单中", "UI", async () => {
      await agent.aiAssert("库存管理成功添加到常用菜单中", "库存管理未成功添加到常用菜单中");
      return true;
    }, 102769);
    
    // 点击保存
    await joyTest.executeStep("点击保存", async () => {
      await agent.aiTap("保存按钮");
    }, 102770);
    
    // 断言常用菜单下显示商品列表和库存管理
    await joyTest.executeAssert("常用菜单下显示商品列表和库存管理", "UI", async () => {
      await agent.aiAssert("常用菜单下显示商品列表和库存管理", "常用菜单下未正确显示商品列表和库存管理");
      return true;
    }, 102770);
    
  });
  
} catch (error) {
  console.error('测试过程中出现异常:', error);
  throw error;
} finally {
  await joyTest.postTest();
}