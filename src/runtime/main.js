const doHMR = (options) => {
  if (import.meta.hot) {
    import.meta.hot.on('drupal:update:twig', async (ctx) => {
      if (!ctx.file.includes('templates') && !ctx.file.includes('components')) {
        throw new Error('All your twig templates needs to be located in a "templates" or "components" folder at the root of your component.');
      }

      const currentHtml = document.documentElement.innerHTML;
      if (!isTwigDevMode(currentHtml)) {
        throw new Error('You have to setup twig dev mode in your Drupal install in order to make HMR work on template update.');
      }

      /*
       * Useful if your Vite root is not the same as your Drupal project/theme one.
       * For example if you have Vite and Drupal in separate Docker containers maybe you don't want to add all your
       * Drupal install into your Vite container, this will result in different root for updated files via HMR.
       */
      const templateBase = options.templateBase.endsWith('/') ? options.templateBase.slice(0, -1) : options.templateBase;
      const templateName = ctx.file.match(/(templates|components)\/.*/)[0];
      const resolvedTemplateName = `${templateBase}/${templateName}`;

      const url = new URL(window.location.href);
      const response = await fetch(url);
      const dom = await response.text();
      const currentHtmlTemplateList = findTemplateInHtml(resolvedTemplateName, currentHtml);
      const reloadedHtmlTemplateList = findTemplateInHtml(resolvedTemplateName, dom);

      if (currentHtmlTemplateList.length <= 0 || reloadedHtmlTemplateList.length <= 0 || currentHtmlTemplateList.length !== reloadedHtmlTemplateList.length) {
        location.reload();
        return;
      }

      const commentWalker = document.createTreeWalker(
        document.querySelector('body'),
        NodeFilter.SHOW_COMMENT,
        null,
      );
      const templateCommentList = searchTemplateCommentList(commentWalker, resolvedTemplateName);

      reloadedHtmlTemplateList.forEach((htmlTemplate, index) => {
        const templateInfo = {
          template: htmlTemplate,
          comment: templateCommentList[index],
        };


        replaceTemplate(templateInfo);
      });
    });
  }
};

const replaceTemplate = (templateInfo) => {
  const betweenCommentWalker = document.createTreeWalker(
    templateInfo.comment.begin,
    NodeFilter.SHOW_ALL,
    null,
  );

  // Remove all siblings until end comment.
  let end = false;
  let node = betweenCommentWalker.currentNode;
  const toRemove = [];
  while (end === false) {
    node = node.nextSibling;

    if (node === null || node === undefined) {
      end = true;
    }
    else if (node.nodeType === Node.COMMENT_NODE && node.data === templateInfo.comment.end.data) {
      end = true;
    }
    else if (node.nodeType === Node.COMMENT_NODE && node.data !== templateInfo.comment.begin.data || node.nodeType !== Node.COMMENT_NODE) {
      toRemove.push(node);
    }
  }

  toRemove.forEach(node => node.remove());

  // Transform fetched template into dom elements.
  const parser = new DOMParser();
  const templateHtml = parser.parseFromString(templateInfo.template, 'text/html');
  const endCommentParent = templateInfo.comment.end.parentNode;

  const toInsertBefore = [...templateHtml.body.childNodes];
  toInsertBefore.filter(node => node.nodeType !== Node.COMMENT_NODE)
    .forEach(node => endCommentParent.insertBefore(node, templateInfo.comment.end));
}

const searchTemplateCommentList = (walker, templateFileName) => {
  const beginOutput = getCommentContent(templateFileName, 'begin');
  const endOutput = getCommentContent(templateFileName, 'end');
  let end = false;
  let beginComment = undefined;
  let list = [];

  while (end === false) {
    const node = walker.nextNode();

    if (node === null) {
      end = true;
    }
    else if (transformTextIntoComment(node.data) === beginOutput) {
      beginComment = node;
    }
    else if (beginComment instanceof Node && transformTextIntoComment(node.data) === endOutput) {
      list.push({
        begin: beginComment,
        end: node,
      });
      beginComment = undefined;
    }
  }

  return list;
}


const findTemplateInHtml = (templateFileName, html) => {
  const beginOutput = getCommentContent(templateFileName, 'begin');
  const endOutput = getCommentContent(templateFileName, 'end');
  // Use matchAll because the template can be used multiple times in the same page.
  const regexp = new RegExp(`${beginOutput}.*?${endOutput}`, 'gmsd');

  return [...html.matchAll(regexp)];
}

/**
 * This function generates an emoji based on the input string.
 *
 * Based on Drupal's emojiForString function: https://git.drupalcode.org/project/drupal/-/blob/11.x/core/lib/Drupal/Core/Template/ComponentNodeVisitor.php#L188-216
 */
const getEmojiForString = (input) => {
  const MAX_LENGTH = 40;
  const EMOJI_START = 129338;
  const EMOJI_END = 129431;
  const RANGE = EMOJI_END - EMOJI_START;

  // Step 1–3: normalize string
  input = input.toLowerCase().replace(/[-_:]/g, '0').substring(0, MAX_LENGTH);

  // Step 4–5: split + pad to 20
  const chars = input.split('');
  while (chars.length < 20) chars.push('0');

  // Step 6: sum char codes
  let sum = 0;
  for (const c of chars) sum += c.charCodeAt(0);

  // Step 7–10: scale exactly like PHP
  const fraction = sum / 4880;
  const codePoint = Math.floor(EMOJI_START + fraction * RANGE);

  return String.fromCodePoint(codePoint);
}

const getThemeName = (templateFileName) => {
  const parts = templateFileName.split('/');
  const compIndex = parts.indexOf('components');
  if (compIndex > 0) {
    return parts[compIndex - 1];
  }

  return '';
}

const getCommentContent = (templateFileName, type) => {
  const isTemplate = templateFileName.includes('/templates/');
  const isComponent = !isTemplate && templateFileName.includes('/components/');

  if (isComponent) {
    const themeName = getThemeName(templateFileName);
    // extract "button-link" from ".../button-link.twig"
    const fileName = templateFileName
      .split("/")
      .pop()
      .replace(/\.twig$/, '');
    const emoji = getEmojiForString(`${themeName}:${fileName}`);

    if (type === 'begin') {
      return `<!-- ${emoji} Component start: ${themeName}:${fileName} -->`;
    }
    if (type === 'end') {
      return `<!-- ${emoji} Component end: ${themeName}:${fileName} -->`;
    }
  }

  if (isTemplate) {
    if (type === 'begin') {
      return `<!-- 💡 BEGIN CUSTOM TEMPLATE OUTPUT from '${templateFileName}' -->`;
    }
    if (type === 'end') {
      return `<!-- END CUSTOM TEMPLATE OUTPUT from '${templateFileName}' -->`;
    }
  }

  return '';
}

const transformTextIntoComment = (text) => {
  return `<!--${text}-->`;
}

const isTwigDevMode = (html) => {
  const found = html.match("<!-- THEME DEBUG -->");
  return found !== null && found.length > 0;
}

export {
  doHMR,
}
